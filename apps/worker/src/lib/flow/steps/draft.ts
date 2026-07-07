import { generateReply } from "../../generate-reply.js"
import { REPLY_HEADER } from "../../instructions.js"
import type { ProposedAction } from "@workspace/actions"
import type { Step, StepContext } from "../types.js"

// Step: persist the decision row, then act on it — escalate to a human, or
// draft a reply (FAQ / offer / refund) and queue it for approval. Nothing is
// sent or refunded here; that happens only on human approval in the dashboard.
export const DraftStep: Step = {
  key: "draft",
  async run(ctx, config) {
    const {
      email,
      supabase,
      product,
      classification: cls,
      enrichment,
      decision: dec,
    } = ctx
    if (!cls || !dec) throw new Error("draft: classification/decision missing")

    // The reply system prompt = hard-coded safety framing + this node's editable
    // prompt (flow_nodes.ai_prompt, edited on /flows). No shared prompt layer.
    const replyInstructions = `${REPLY_HEADER}\n\n---\n\n${config.ai_prompt ?? ""}`

    const isRefund =
      dec.decision === "issue_refund" ||
      dec.decision === "issue_refund_chargeback"
    const isUnsubscribe = dec.decision === "unsubscribe"
    const isReply =
      dec.decision === "send_offer_1" ||
      dec.decision === "send_offer_2" ||
      dec.decision === "send_faq_reply"

    // Unsubscribe proposes the opt-out (added to the suppression list + pushed to
    // the external email system on approval, via suppressContact) and drafts the
    // confirmation — so we only tell them they're removed once approval runs it.
    const baseActions: ProposedAction[] = isRefund
      ? [
          { type: "issue_refund" },
          {
            type: "suppress_contact",
            reason:
              dec.decision === "issue_refund_chargeback"
                ? "chargeback"
                : "refund",
          },
        ]
      : isUnsubscribe
        ? [{ type: "suppress_contact", reason: "unsubscribe" }]
        : []
    // Nodes can also declare proposed actions in their config (e.g. the
    // save-the-sale offer proposes coaching_signup) — merge those in.
    const proposedActions: ProposedAction[] = [
      ...baseActions,
      ...readProposedActions(config.condition),
    ]

    // Carry this node's send-delay range (if set) onto the decision so approval
    // can schedule the reply with a human-feeling delay without re-loading the
    // node. config.condition is the node's config (see toStepConfig).
    const sendDelay = readSendDelay(config.condition)
    // The node this offer/question came from can declare the resume node the
    // thread will await a reply at (stamped onto the thread cursor at send time).
    const awaitsReplyAt = readAwaitsReplyAt(config.condition)
    const context = {
      // The classifier's "why this category" — stored so a mis-classification
      // can be debugged from the ticket instead of blindly re-tuning prompts.
      classification_reasoning: cls.reasoning,
      ...(enrichment ? enrichment.context : {}),
      ...(sendDelay ? { send_delay: sendDelay } : {}),
      ...(awaitsReplyAt ? { awaits_reply_at: awaitsReplyAt } : {}),
      // reply_branch "why" per node, so the trace can explain each gate/branch.
      ...(ctx.branchReasons && Object.keys(ctx.branchReasons).length > 0
        ? { branch_reasons: ctx.branchReasons }
        : {}),
      ...(ctx.spamReasoning ? { spam_reasoning: ctx.spamReasoning } : {}),
    }

    const { data: row, error: decErr } = await supabase
      .from("decisions")
      .insert({
        email_id: email.id,
        product_id: product?.productId ?? null,
        classification: cls.classification,
        llm_model: dec.llmModel,
        llm_reasoning: dec.combinedReasoning,
        decision: dec.decision,
        template_used: dec.template_used,
        refund_request_count: dec.refund_request_count,
        context,
        proposed_actions: proposedActions,
      })
      .select("id")
      .single()
    if (decErr || !row)
      throw new Error(`decision_insert_failed: ${decErr?.message}`)

    await supabase.from("audit_log").insert({
      action: "classify_email",
      email_id: email.id,
      status: "success",
      payload: {
        decision_id: row.id,
        classification: cls.classification,
        decision: dec.decision,
        template_used: dec.template_used,
        refund_request_count: dec.refund_request_count,
        usage: { haiku: cls.usage, sonnet: dec.sonnetUsage ?? null },
      },
    })

    console.log(
      `[worker] ${email.id}: classify=${cls.classification} decide=${dec.decision}`
    )

    if (dec.decision === "escalate") {
      await supabase
        .from("decisions")
        .update({ status: "needs_human" })
        .eq("id", row.id)
      await supabase.from("audit_log").insert({
        action: "escalate_needs_human",
        email_id: email.id,
        status: "success",
        payload: { decision_id: row.id, decision: dec.decision },
      })
    } else if (isReply || isUnsubscribe) {
      await draftAndQueue(
        ctx,
        row.id,
        "reply_pending_approval",
        replyInstructions
      )
    } else if (isRefund) {
      await draftAndQueue(
        ctx,
        row.id,
        "refund_pending_approval",
        replyInstructions
      )
    }

    return { decisionId: row.id }
  },
}

// This node's optional send-delay range (minutes), read from node.config
// (FlowStepConfig.condition). 0/0 or missing means send immediately.
function readSendDelay(
  condition: unknown
): { min: number; max: number } | null {
  if (!condition || typeof condition !== "object") return null
  const c = condition as Record<string, unknown>
  const min = Number(c.send_delay_min_minutes)
  const max = Number(c.send_delay_max_minutes)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  const lo = Math.max(0, min)
  const hi = Math.max(lo, max)
  if (lo === 0 && hi === 0) return null
  return { min: lo, max: hi }
}

// Proposed actions a node declares in its config (merged with the decision's
// own refund/unsubscribe actions). Only well-formed { type: string } entries.
function readProposedActions(condition: unknown): ProposedAction[] {
  if (!condition || typeof condition !== "object") return []
  const raw = (condition as Record<string, unknown>).proposed_actions
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (a): a is ProposedAction =>
      !!a &&
      typeof a === "object" &&
      typeof (a as { type?: unknown }).type === "string"
  )
}

// The node_key the thread should resume at when the customer replies to this
// offer/question. Stamped onto the thread cursor at send time (approvals/send).
function readAwaitsReplyAt(condition: unknown): string | null {
  if (!condition || typeof condition !== "object") return null
  const v = (condition as Record<string, unknown>).awaits_reply_at
  return typeof v === "string" && v ? v : null
}

// Generate the reply, queue it for approval, and audit. On failure, mark the
// (already-persisted) decision failed + audit. Shared by the reply + refund
// branches (they differ only in the success audit action).
async function draftAndQueue(
  ctx: StepContext,
  decisionId: string,
  auditAction: "reply_pending_approval" | "refund_pending_approval",
  replyInstructions: string
): Promise<void> {
  const { email, supabase, anthropic, productFacts, enrichment } = ctx
  try {
    const reply = await generateReply({
      email,
      customerContext: enrichment?.customerContext,
      productFacts,
      replyInstructions,
      anthropic,
    })
    await supabase
      .from("decisions")
      .update({ status: "pending_approval", draft_reply_text: reply.text })
      .eq("id", decisionId)
    await supabase.from("audit_log").insert({
      action: auditAction,
      email_id: email.id,
      status: "success",
      payload: {
        decision_id: decisionId,
        draft_reply_text: reply.text,
        usage: reply.usage,
      },
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await supabase
      .from("decisions")
      .update({ status: "failed" })
      .eq("id", decisionId)
    await supabase.from("audit_log").insert({
      action: "generate_reply_failed",
      email_id: email.id,
      status: "failure",
      error,
      payload: { decision_id: decisionId },
    })
  }
}

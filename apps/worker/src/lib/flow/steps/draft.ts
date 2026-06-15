import { generateReply, type Template } from "../../generate-reply.js"
import { loadTemplateBlock } from "../../templates.js"
import type { ProposedAction } from "@workspace/actions"
import type { Step, StepContext } from "../types.js"

const REPLY_TEMPLATES = {
  send_faq_reply: "FAQ_REPLY",
  send_offer_1: "OFFER_1",
  send_offer_2: "OFFER_2",
} as const
const REFUND_TEMPLATES = {
  issue_refund: "REFUND_CONFIRMATION",
  issue_refund_chargeback: "REFUND_CHARGEBACK_APOLOGY",
} as const

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

    // Per-flow override: this step's ai_prompt overrides the global reply
    // instructions (editable at /prompts). Blank = fall back.
    const replyInstructions =
      config.ai_prompt && config.ai_prompt.trim()
        ? config.ai_prompt
        : ctx.instructions.reply

    const isRefund =
      dec.decision === "issue_refund" ||
      dec.decision === "issue_refund_chargeback"
    const isReply =
      dec.decision === "send_offer_1" ||
      dec.decision === "send_offer_2" ||
      dec.decision === "send_faq_reply"

    const proposedActions: ProposedAction[] = isRefund
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
      : []

    const context = enrichment
      ? { inquiry_type: cls.inquiry_type, ...enrichment.context }
      : { inquiry_type: cls.inquiry_type }

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
    if (decErr || !row) throw new Error(`decision_insert_failed: ${decErr?.message}`)

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
    } else if (isReply) {
      await draftAndQueue(
        ctx,
        row.id,
        REPLY_TEMPLATES[dec.decision as keyof typeof REPLY_TEMPLATES],
        "reply_pending_approval",
        replyInstructions
      )
    } else if (isRefund) {
      await draftAndQueue(
        ctx,
        row.id,
        REFUND_TEMPLATES[dec.decision as keyof typeof REFUND_TEMPLATES],
        "refund_pending_approval",
        replyInstructions
      )
    }

    return { decisionId: row.id }
  },
}

// Generate the reply, queue it for approval, and audit. On failure, mark the
// (already-persisted) decision failed + audit. Shared by the reply + refund
// branches (they differ only in the success audit action).
async function draftAndQueue(
  ctx: StepContext,
  decisionId: string,
  template: Template,
  auditAction: "reply_pending_approval" | "refund_pending_approval",
  replyInstructions: string
): Promise<void> {
  const { email, supabase, anthropic, productFacts, enrichment } = ctx
  try {
    const templates = await loadTemplateBlock(supabase)
    const reply = await generateReply({
      template,
      email,
      customerContext: enrichment?.customerContext,
      productFacts,
      replyInstructions,
      templates: templates || undefined,
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
        template,
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
      payload: { decision_id: decisionId, template },
    })
  }
}

import type { Job } from "bullmq"
import { z } from "zod/v4"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { getAnthropic } from "../lib/anthropic.js"
import { getSupabase } from "../lib/supabase.js"
import { getInstructions } from "../lib/instructions.js"
import { decideRefund, type RefundDecision } from "../lib/refund-decision.js"
import { generateReply } from "../lib/generate-reply.js"
import { getAdapter, type ProposedAction } from "@workspace/actions"
import { gatherCustomerContext } from "../lib/customer-context.js"
import { renderProductFacts } from "../lib/product-facts.js"
import { stripQuotedReply } from "../lib/strip-quotes.js"

const ClassificationResult = z.object({
  classification: z.enum(["refund_request", "faq", "other"]),
  inquiry_type: z
    .enum(["existing_member", "prospective_buyer"])
    .describe(
      "existing_member if they reference a purchase/account they already have; prospective_buyer if they're asking about buying or joining"
    ),
  reasoning: z
    .string()
    .describe("1-2 sentences explaining the signals that drove this label"),
})

type DecisionShape = {
  decision: string
  template_used: string | null
  refund_request_count: number | null
  combinedReasoning: string
  llmModel: string
  sonnetUsage?: RefundDecision["sonnet_usage"]
}

export async function processEmail(job: Job) {
  const { emailId } = job.data as { emailId: string }
  console.log(`[worker] processing job ${job.id}`, { emailId })

  const supabase = getSupabase()
  const anthropic = getAnthropic()
  const instructions = await getInstructions(supabase)

  // 1. Fetch the email
  const { data: emailRow, error: emailErr } = await supabase
    .from("emails")
    .select(
      "id, thread_id, from_email, to_email, subject, body_text, agent_mail_message_id"
    )
    .eq("id", emailId)
    .single()
  if (emailErr || !emailRow) {
    throw new Error(`email_not_found: ${emailId} (${emailErr?.message ?? ""})`)
  }
  // Strip quoted reply history / forwarded chains so classification, the refund
  // regex, and drafting all act on the customer's NEW message — not the quoted
  // thread underneath. Raw body stays in the DB (emails row) for the thread/audit.
  const email = {
    ...emailRow,
    body_text: stripQuotedReply(emailRow.body_text),
  }

  // 2. Classify via Haiku
  const userText =
    `From: ${email.from_email}\n` +
    `Subject: ${email.subject}\n\n` +
    (email.body_text ?? "(empty body)")

  const classifyResp = await anthropic.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: instructions.classifier,
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ],
    messages: [{ role: "user", content: userText }],
    output_config: { format: zodOutputFormat(ClassificationResult) },
  })
  if (!classifyResp.parsed_output) {
    throw new Error("classifier_parse_failed")
  }
  const cls = classifyResp.parsed_output

  // 2b. Resolve the product; for existing members, gather verified purchase +
  // access context before drafting (Ben: "first thing we do is check that they
  // bought ... then check they have access").
  const product = await resolveProduct(supabase, email.thread_id)
  const productFacts = product
    ? (renderProductFacts(product.name, product.supportConfig) ?? undefined)
    : undefined
  let enrichment: Awaited<ReturnType<typeof gatherCustomerContext>> | null = null
  if (cls.inquiry_type === "existing_member" && product?.adapterKey) {
    try {
      enrichment = await gatherCustomerContext(
        getAdapter(product.adapterKey),
        email
      )
      await supabase.from("audit_log").insert({
        action: "gather_context",
        email_id: email.id,
        status: "success",
        payload: {
          found: enrichment.context.orders.length > 0,
          order_count: enrichment.context.orders.length,
          has_access: enrichment.context.access.hasAccess,
        },
      })
    } catch (err) {
      await supabase.from("audit_log").insert({
        action: "gather_context",
        email_id: email.id,
        status: "failure",
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  const context = enrichment
    ? { inquiry_type: cls.inquiry_type, ...enrichment.context }
    : { inquiry_type: cls.inquiry_type }

  // 3. Decide what to do with this email
  const dec: DecisionShape = await decide(
    cls,
    email,
    supabase,
    anthropic,
    instructions.classifier,
    product?.productId ?? null
  )

  const isRefundDecision =
    dec.decision === "issue_refund" ||
    dec.decision === "issue_refund_chargeback"
  const isReplyDecision =
    dec.decision === "send_offer_1" ||
    dec.decision === "send_offer_2" ||
    dec.decision === "send_faq_reply"
  const isEscalate = dec.decision === "escalate"

  // Refund decisions propose the refund + suppressing the contact from outbound
  // email; both execute only on human approval.
  const proposedActions: ProposedAction[] = isRefundDecision
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

  // 4. Insert the complete decisions row
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
  if (decErr || !row) {
    throw new Error(`decision_insert_failed: ${decErr?.message}`)
  }

  // 5. Audit log with both Haiku and Sonnet (when present) usage
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
      usage: {
        haiku: {
          input_tokens: classifyResp.usage.input_tokens,
          output_tokens: classifyResp.usage.output_tokens,
          cache_read_input_tokens: classifyResp.usage.cache_read_input_tokens,
          cache_creation_input_tokens:
            classifyResp.usage.cache_creation_input_tokens,
        },
        sonnet: dec.sonnetUsage ?? null,
      },
    },
  })

  console.log(
    `[worker] ${email.id}: classify=${cls.classification} decide=${dec.decision} cache_read=${classifyResp.usage.cache_read_input_tokens}`
  )

  if (isEscalate) {
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
  } else if (isReplyDecision) {
    const templateMap = {
      send_faq_reply: "FAQ_REPLY",
      send_offer_1: "OFFER_1",
      send_offer_2: "OFFER_2",
    } as const
    const template = templateMap[dec.decision as keyof typeof templateMap]
    try {
      const reply = await generateReply({
        template,
        email,
        customerContext: enrichment?.customerContext,
        productFacts,
        replyInstructions: instructions.reply,
        anthropic,
      })
      await supabase
        .from("decisions")
        .update({
          status: "pending_approval",
          draft_reply_text: reply.text,
        })
        .eq("id", row.id)
      await supabase.from("audit_log").insert({
        action: "reply_pending_approval",
        email_id: email.id,
        status: "success",
        payload: {
          decision_id: row.id,
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
        .eq("id", row.id)
      await supabase.from("audit_log").insert({
        action: "generate_reply_failed",
        email_id: email.id,
        status: "failure",
        error,
        payload: { decision_id: row.id, template },
      })
    }
  } else if (isRefundDecision) {
    const templateMap = {
      issue_refund: "REFUND_CONFIRMATION",
      issue_refund_chargeback: "REFUND_CHARGEBACK_APOLOGY",
    } as const
    const template = templateMap[dec.decision as keyof typeof templateMap]
    try {
      const reply = await generateReply({
        template,
        email,
        customerContext: enrichment?.customerContext,
        productFacts,
        replyInstructions: instructions.reply,
        anthropic,
      })
      await supabase
        .from("decisions")
        .update({
          status: "pending_approval",
          draft_reply_text: reply.text,
        })
        .eq("id", row.id)
      await supabase.from("audit_log").insert({
        action: "refund_pending_approval",
        email_id: email.id,
        status: "success",
        payload: {
          decision_id: row.id,
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
        .eq("id", row.id)
      await supabase.from("audit_log").insert({
        action: "generate_reply_failed",
        email_id: email.id,
        status: "failure",
        error,
        payload: { decision_id: row.id, template },
      })
    }
  }

  return {
    decisionId: row.id,
    classification: cls.classification,
    decision: dec.decision,
  }
}

async function decide(
  cls: z.infer<typeof ClassificationResult>,
  email: { id: string; from_email: string; body_text: string | null },
  supabase: ReturnType<typeof getSupabase>,
  anthropic: ReturnType<typeof getAnthropic>,
  instructions: string,
  productId: string | null
): Promise<DecisionShape> {
  if (cls.classification === "refund_request") {
    const r = await decideRefund({
      email,
      supabase,
      anthropic,
      instructions,
      productId,
    })
    const combinedReasoning = r.sonnet_reasoning
      ? `${cls.reasoning}\n\nSonnet chargeback check: ${r.sonnet_reasoning}`
      : cls.reasoning
    return {
      decision: r.decision,
      template_used: r.template_used,
      refund_request_count: r.refund_request_count,
      combinedReasoning,
      llmModel: r.sonnet_usage
        ? "claude-haiku-4-5 + claude-sonnet-4-6"
        : "claude-haiku-4-5",
      sonnetUsage: r.sonnet_usage,
    }
  }

  if (cls.classification === "faq") {
    return {
      decision: "send_faq_reply",
      template_used: null,
      refund_request_count: null,
      combinedReasoning: cls.reasoning,
      llmModel: "claude-haiku-4-5",
    }
  }

  return {
    decision: "escalate",
    template_used: null,
    refund_request_count: null,
    combinedReasoning: cls.reasoning,
    llmModel: "claude-haiku-4-5",
  }
}

// Resolves the thread's product + which adapter handles it. Returns null when
// the thread has no product (un-routed / legacy), in which case enrichment is
// skipped and the email is still drafted for human review.
async function resolveProduct(
  supabase: ReturnType<typeof getSupabase>,
  threadId: string | null
): Promise<{
  productId: string
  adapterKey: string | null
  name: string
  supportConfig: unknown
} | null> {
  if (!threadId) return null
  const { data: thread } = await supabase
    .from("threads")
    .select("product_id")
    .eq("id", threadId)
    .maybeSingle()
  if (!thread?.product_id) return null
  const { data: product } = await supabase
    .from("products")
    .select("name, adapter_key, support_config")
    .eq("id", thread.product_id)
    .maybeSingle()
  return {
    productId: thread.product_id,
    adapterKey: product?.adapter_key ?? null,
    name: product?.name ?? "the product",
    supportConfig: product?.support_config ?? null,
  }
}

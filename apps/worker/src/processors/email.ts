import type { Job } from "bullmq"
import { z } from "zod/v4"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { getAnthropic } from "../lib/anthropic.js"
import { getSupabase } from "../lib/supabase.js"
import { INSTRUCTIONS_TEXT } from "../lib/instructions.js"
import { decideRefund, type RefundDecision } from "../lib/refund-decision.js"
import { sendReply, getAgentMailInboxId } from "@workspace/actions"
import { generateReply } from "../lib/generate-reply.js"

const ClassificationResult = z.object({
  classification: z.enum(["refund_request", "faq", "other"]),
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

  // 1. Fetch the email
  const { data: email, error: emailErr } = await supabase
    .from("emails")
    .select("id, from_email, to_email, subject, body_text, agent_mail_message_id")
    .eq("id", emailId)
    .single()
  if (emailErr || !email) {
    throw new Error(`email_not_found: ${emailId} (${emailErr?.message ?? ""})`)
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
        text: INSTRUCTIONS_TEXT,
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

  // 3. Decide what to do with this email
  const dec: DecisionShape = await decide(cls, email, supabase, anthropic)

  // 4. Insert the complete decisions row
  const { data: row, error: decErr } = await supabase
    .from("decisions")
    .insert({
      email_id: email.id,
      classification: cls.classification,
      llm_model: dec.llmModel,
      llm_reasoning: dec.combinedReasoning,
      decision: dec.decision,
      template_used: dec.template_used,
      refund_request_count: dec.refund_request_count,
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

  const isRefundDecision =
    dec.decision === "issue_refund" ||
    dec.decision === "issue_refund_chargeback"
  const isReplyDecision =
    dec.decision === "send_offer_1" ||
    dec.decision === "send_offer_2" ||
    dec.decision === "send_faq_reply"
  const isEscalate = dec.decision === "escalate"

  if (isEscalate) {
    await supabase
      .from("decisions")
      .update({ status: "needs_human" })
      .eq("id", row.id)
  } else if (isReplyDecision) {
    const templateMap = {
      send_faq_reply: "FAQ_REPLY",
      send_offer_1: "OFFER_1",
      send_offer_2: "OFFER_2",
    } as const
    const template = templateMap[dec.decision as keyof typeof templateMap]
    try {
      const reply = await generateReply({ template, email, anthropic })
      const sent = await sendReply({
        inboxId: getAgentMailInboxId(),
        inReplyToMessageId: email.agent_mail_message_id ?? "",
        replyText: reply.text,
        decisionId: row.id,
        supabase,
      })
      await supabase
        .from("decisions")
        .update({
          status: sent.ok ? "sent" : "failed",
          draft_reply_text: reply.text,
        })
        .eq("id", row.id)
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
  // Refund branches handled in Task 8.

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
  anthropic: ReturnType<typeof getAnthropic>
): Promise<DecisionShape> {
  if (cls.classification === "refund_request") {
    const r = await decideRefund({ email, supabase, anthropic })
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

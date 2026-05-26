import type { Job } from "bullmq"
import { z } from "zod/v4"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { getAnthropic } from "../lib/anthropic.js"
import { getSupabase } from "../lib/supabase.js"
import { INSTRUCTIONS_TEXT } from "../lib/instructions.js"

const ClassificationResult = z.object({
  classification: z.enum(["refund_request", "faq", "other"]),
  reasoning: z
    .string()
    .describe("1-2 sentences explaining the signals that drove this label"),
})

export async function processEmail(job: Job) {
  const { emailId } = job.data as { emailId: string }
  console.log(`[worker] processing job ${job.id}`, { emailId })

  const supabase = getSupabase()

  const { data: email, error: emailErr } = await supabase
    .from("emails")
    .select("id, from_email, to_email, subject, body_text")
    .eq("id", emailId)
    .single()
  if (emailErr || !email) {
    throw new Error(`email_not_found: ${emailId} (${emailErr?.message ?? ""})`)
  }

  const userText =
    `From: ${email.from_email}\n` +
    `Subject: ${email.subject}\n\n` +
    (email.body_text ?? "(empty body)")

  const anthropic = getAnthropic()
  const response = await anthropic.messages.parse({
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

  if (!response.parsed_output) {
    throw new Error("classifier_parse_failed")
  }
  const result = response.parsed_output

  const { data: decision, error: decisionErr } = await supabase
    .from("decisions")
    .insert({
      email_id: email.id,
      classification: result.classification,
      llm_model: "claude-haiku-4-5",
      llm_reasoning: result.reasoning,
    })
    .select("id")
    .single()
  if (decisionErr || !decision) {
    throw new Error(`decision_insert_failed: ${decisionErr?.message}`)
  }

  await supabase.from("audit_log").insert({
    action: "classify_email",
    email_id: email.id,
    status: "success",
    payload: {
      decision_id: decision.id,
      classification: result.classification,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_input_tokens: response.usage.cache_read_input_tokens,
        cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
      },
    },
  })

  console.log(
    `[worker] classified ${email.id} as ${result.classification} (cache_read=${response.usage.cache_read_input_tokens})`
  )
  return { decisionId: decision.id, classification: result.classification }
}

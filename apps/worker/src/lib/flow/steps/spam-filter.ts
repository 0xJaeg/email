import { z } from "zod/v4"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import type { Step } from "../types.js"

const SpamResult = z.object({
  is_spam: z.boolean(),
  reasoning: z.string().describe("1 sentence — why spam or not"),
})

const DEFAULT_PROMPT =
  "You are a spam filter for a product support inbox. Mark is_spam=true ONLY for clear junk: bulk marketing, phishing, automated bounce/out-of-office notices, or unrelated solicitations. A real customer question — even angry, vague, or off-topic — is NOT spam."

// Step: cheap spam gate, runs first. On spam, record a quarantined decision +
// audit and halt the flow (no classify/enrich/decide/draft, no platform API
// calls). Quarantined (not deleted) so nothing is lost while tuning.
//
// Fails OPEN: because this fronts the whole pipeline on every ticket, any error
// (API blip, schema-validation failure, failed insert) must NOT drop the email
// — we audit and continue to classify so the ticket is processed normally.
export const SpamFilterStep: Step = {
  key: "spam_filter",
  async run(ctx, config) {
    const { email, anthropic, supabase, product } = ctx
    const prompt = config.ai_prompt?.trim() ? config.ai_prompt : DEFAULT_PROMPT

    try {
      const resp = await anthropic.messages.parse({
        model: "claude-haiku-4-5",
        max_tokens: 256,
        system: [
          {
            type: "text",
            text: prompt,
            cache_control: { type: "ephemeral", ttl: "1h" },
          },
        ],
        messages: [
          {
            role: "user",
            content:
              `From: ${email.from_email}\n` +
              `Subject: ${email.subject}\n\n` +
              (email.body_text ?? "(empty body)"),
          },
        ],
        output_config: { format: zodOutputFormat(SpamResult) },
      })
      if (!resp.parsed_output?.is_spam) return {}

      const { data: row, error: decErr } = await supabase
        .from("decisions")
        .insert({
          email_id: email.id,
          product_id: product?.productId ?? null,
          classification: "spam",
          decision: "quarantine_spam",
          llm_model: "claude-haiku-4-5",
          llm_reasoning: resp.parsed_output.reasoning,
          status: "quarantined",
          proposed_actions: [],
        })
        .select("id")
        .single()
      if (decErr || !row)
        throw new Error(`spam_decision_insert_failed: ${decErr?.message}`)

      await supabase.from("audit_log").insert({
        action: "spam_quarantined",
        email_id: email.id,
        status: "success",
        payload: {
          decision_id: row.id,
          reasoning: resp.parsed_output.reasoning,
        },
      })

      console.log(`[worker] ${email.id}: spam — quarantined, flow halted`)
      return { halt: true }
    } catch (err) {
      await supabase.from("audit_log").insert({
        action: "spam_filter_failed",
        email_id: email.id,
        status: "failure",
        error: err instanceof Error ? err.message : String(err),
      })
      return {}
    }
  },
}

import { z } from "zod/v4"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import type { Step } from "../types.js"

const GateResult = z.object({
  needs_lookup: z.boolean(),
  reasoning: z
    .string()
    .describe("1 sentence — why a lookup is or isn't needed"),
})

const DEFAULT_PROMPT =
  "You decide whether answering this support email requires looking up the sender's order or account in our systems. needs_lookup=true for: login/access problems, 'where is my product', refund or billing requests, account changes. needs_lookup=false for: pre-sale questions ('how do I buy', pricing), general info, or a thank-you/closing note."

// Step: cheap AI gate (runs after classify). Decides whether this ticket needs
// an order/account lookup so we don't hit platform APIs on every ticket.
// Writes ctx.needsLookup, which EnrichStep honors.
export const LookupGateStep: Step = {
  key: "lookup_gate",
  async run(ctx, config) {
    const { email, anthropic, classification } = ctx
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
              `Subject: ${email.subject}\n` +
              `Classification: ${classification?.classification ?? "unknown"}\n\n` +
              (email.body_text ?? "(empty body)"),
          },
        ],
        output_config: { format: zodOutputFormat(GateResult) },
      })

      return { needsLookup: resp.parsed_output?.needs_lookup ?? false }
    } catch {
      // Fail open: leave needsLookup undefined so EnrichStep falls back to its
      // inquiry_type gate rather than aborting the flow on a gate error.
      return {}
    }
  },
}

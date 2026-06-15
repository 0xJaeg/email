import { z } from "zod/v4"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import type { Step } from "../types.js"

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

// Step: classify the inbound email (refund/FAQ/other + existing/prospective).
export const ClassifyStep: Step = {
  key: "classify",
  async run(ctx) {
    const { email, anthropic, instructions } = ctx
    const userText =
      `From: ${email.from_email}\n` +
      `Subject: ${email.subject}\n\n` +
      (email.body_text ?? "(empty body)")

    const resp = await anthropic.messages.parse({
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
    if (!resp.parsed_output) throw new Error("classifier_parse_failed")

    return {
      classification: {
        ...resp.parsed_output,
        usage: {
          input_tokens: resp.usage.input_tokens,
          output_tokens: resp.usage.output_tokens,
          cache_read_input_tokens: resp.usage.cache_read_input_tokens,
          cache_creation_input_tokens: resp.usage.cache_creation_input_tokens,
        },
      },
    }
  },
}

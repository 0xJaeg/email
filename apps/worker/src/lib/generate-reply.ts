import type Anthropic from "@anthropic-ai/sdk"

export type Template =
  | "FAQ_REPLY"
  | "OFFER_1"
  | "OFFER_2"
  | "REFUND_CONFIRMATION"
  | "REFUND_CHARGEBACK_APOLOGY"

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number | null
  cache_creation_input_tokens: number | null
}

export type GenerateReplyArgs = {
  template: Template
  email: { from_email: string; subject: string; body_text: string | null }
  /** Verified purchase/access context to ground the reply, if gathered. */
  customerContext?: string
  /** The product's real support facts (login/reset/dashboard URLs, platform). */
  productFacts?: string
  /** Customer-facing reply guidance (assembled from prompt_configs). */
  replyInstructions: string
  /** Active response templates rendered as a reference block, if any. */
  templates?: string
  anthropic: Anthropic
}

export type GenerateReplyResult = {
  text: string
  usage: Usage
}

// Customer-facing replies must not contain em/en dashes — they read as
// AI-written. Replace with a hyphen (prose + numeric ranges both read fine).
export function stripEmDashes(text: string): string {
  return text.replace(/[—–]/g, "-")
}

export async function generateReply(
  args: GenerateReplyArgs
): Promise<GenerateReplyResult> {
  const contextBlock = args.customerContext
    ? `\n\nVerified customer context — use it; do not invent details beyond it:\n${args.customerContext}`
    : ""
  const factsBlock = args.productFacts
    ? `\n\nProduct support facts — the ONLY real links you may use; never invent, guess, or use example URLs:\n${args.productFacts}`
    : ""
  const templatesBlock = args.templates
    ? `\n\nReusable response templates you can draw on (adapt the most relevant one; skip them all if none fit):\n${args.templates}`
    : ""
  const userMessage =
    `Write the customer-facing email reply for the message below, using the ` +
    `${args.template} approach from your guidance. Plain text only — just the ` +
    `reply body.\n\n` +
    `From: ${args.email.from_email}\n` +
    `Subject: ${args.email.subject}\n\n` +
    (args.email.body_text ?? "(empty body)") +
    contextBlock +
    factsBlock +
    templatesBlock

  const response = await args.anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: args.replyInstructions,
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || !("text" in textBlock) || !textBlock.text.trim()) {
    throw new Error("generate_reply: empty response from Haiku")
  }

  return {
    text: stripEmDashes(textBlock.text),
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
    },
  }
}

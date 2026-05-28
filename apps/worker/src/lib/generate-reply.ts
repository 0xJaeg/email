import type Anthropic from "@anthropic-ai/sdk"
import { INSTRUCTIONS_TEXT } from "./instructions.js"

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
  anthropic: Anthropic
}

export type GenerateReplyResult = {
  text: string
  usage: Usage
}

export async function generateReply(
  args: GenerateReplyArgs
): Promise<GenerateReplyResult> {
  const userMessage =
    `Compose a ${args.template} reply to this email. Follow the policy and ` +
    `voice guidance in the system prompt. Plain text only, no greeting line ` +
    `unless the template calls for one.\n\n` +
    `From: ${args.email.from_email}\n` +
    `Subject: ${args.email.subject}\n\n` +
    (args.email.body_text ?? "(empty body)")

  const response = await args.anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: INSTRUCTIONS_TEXT,
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
    text: textBlock.text,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
    },
  }
}

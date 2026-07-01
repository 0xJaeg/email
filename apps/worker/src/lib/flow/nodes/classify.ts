import { z } from "zod/v4"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { HEADER } from "../../instructions.js"
import type { FlowNode, NodeType, StepContext } from "../types.js"

type Category = { key: string; label?: string; description?: string }

// Fallback categories for a classify node that carries none in its config.
const DEFAULT_CATEGORIES: Category[] = [
  { key: "refund_request" },
  { key: "faq" },
  { key: "other" },
]

// Classifies the inbound email into the node's configured categories and emits
// the chosen label as the branch outcome. The system prompt is the hard-coded
// HEADER framing + this node's editable prompt (flow_nodes.ai_prompt, edited on
// /flows) — there is no shared prompt layer.
export const ClassifyNode: NodeType = {
  type: "classify",
  async run(ctx, node) {
    const configured = node.config.categories as Category[] | undefined
    const cats =
      configured && configured.length ? configured : DEFAULT_CATEGORIES
    const patch = await classify(ctx, node, cats)
    return {
      ...patch,
      outcome: patch.classification?.classification ?? "default",
    }
  },
}

async function classify(
  ctx: StepContext,
  node: FlowNode,
  cats: Category[]
): Promise<Partial<StepContext>> {
  const { email, anthropic } = ctx
  const prompt = `${HEADER}\n\n---\n\n${node.ai_prompt ?? ""}`
  const keys = cats.map((c) => c.key) as [string, ...string[]]
  const guide = cats
    .map((c) => `- ${c.key}: ${c.description ?? c.label ?? c.key}`)
    .join("\n")
  const Result = z.object({
    classification: z.enum(keys),
    reasoning: z
      .string()
      .describe("1-2 sentences explaining the signals that drove this label"),
  })
  const userText =
    `From: ${email.from_email}\n` +
    `Subject: ${email.subject}\n\n` +
    `Categories:\n${guide}\n\n` +
    (email.body_text ?? "(empty body)")

  const resp = await anthropic.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: prompt,
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ],
    messages: [{ role: "user", content: userText }],
    output_config: { format: zodOutputFormat(Result) },
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
}

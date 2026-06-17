import { z } from "zod/v4"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { ClassifyStep } from "../steps/classify.js"
import { toStepConfig } from "./adapt.js"
import type { FlowNode, NodeType, StepContext } from "../types.js"

type Category = { key: string; label?: string; description?: string }

// Classifies the inbound email and emits the chosen label as the branch outcome.
// When the node carries config.categories, it classifies into THOSE categories
// (so the tree can branch per category); otherwise it falls back to the existing
// 3-label classifier (refund_request/faq/other), keeping the default tree's
// behavior byte-identical.
export const ClassifyNode: NodeType = {
  type: "classify",
  async run(ctx, node) {
    const cats = node.config.categories as Category[] | undefined
    const patch =
      cats && cats.length
        ? await classifyWithCategories(ctx, node, cats)
        : await ClassifyStep.run(ctx, toStepConfig(node))
    return {
      ...patch,
      outcome: patch.classification?.classification ?? "default",
    }
  },
}

async function classifyWithCategories(
  ctx: StepContext,
  node: FlowNode,
  cats: Category[]
): Promise<Partial<StepContext>> {
  const { email, anthropic, instructions } = ctx
  const prompt =
    node.ai_prompt && node.ai_prompt.trim()
      ? node.ai_prompt
      : instructions.classifier
  const keys = cats.map((c) => c.key) as [string, ...string[]]
  const guide = cats
    .map((c) => `- ${c.key}: ${c.description ?? c.label ?? c.key}`)
    .join("\n")
  const Result = z.object({
    classification: z.enum(keys),
    inquiry_type: z
      .enum(["existing_member", "prospective_buyer"])
      .describe(
        "existing_member if they reference a purchase/account they already have; prospective_buyer if they're asking about buying or joining"
      ),
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

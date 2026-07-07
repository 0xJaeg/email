import { z } from "zod/v4"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { HEADER } from "../../instructions.js"
import type { FlowNode, NodeType, StepContext } from "../types.js"

type Branch = { key: string; description?: string }

// A reusable decision node: reads the customer's message and picks one of the
// node's configured branches, emitting the chosen key as the outcome so the
// graph edges fan out. Used for the up-front "did they state a problem?" gate
// AND the on-reply accept/decline reads when the flow resumes after an offer.
// Writes no decision row and sends nothing — it is a pure branch, like classify.
//
// On a RESUMED run (ctx.priorDecision is set and classify was skipped) it also
// carries the prior decision's classification onto ctx so the downstream
// send_reply / refund_draft nodes have the classification they require.
export const ReplyBranchNode: NodeType = {
  type: "reply_branch",
  async run(ctx, node) {
    const branches = (node.config.branches as Branch[] | undefined) ?? []
    if (branches.length === 0) {
      throw new Error(`reply_branch '${node.node_key}': no branches configured`)
    }
    const result = await decide(ctx, node, branches)

    const patch: Partial<StepContext> = {
      // Keep this branch's "why" (node_key -> reason) for the ticket trace.
      branchReasons: {
        ...(ctx.branchReasons ?? {}),
        [node.node_key]: result.reasoning,
      },
    }
    if (ctx.priorDecision && !ctx.classification) {
      patch.classification = {
        classification: ctx.priorDecision.classification,
        reasoning: result.reasoning,
        usage: result.usage,
      }
    }
    return { ...patch, outcome: result.outcome }
  },
}

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number | null
  cache_creation_input_tokens: number | null
}

async function decide(
  ctx: StepContext,
  node: FlowNode,
  branches: Branch[]
): Promise<{ outcome: string; reasoning: string; usage: Usage }> {
  const { email, anthropic } = ctx
  const prompt = `${HEADER}\n\n---\n\n${node.ai_prompt ?? ""}`
  const keys = branches.map((b) => b.key) as [string, ...string[]]
  const guide = branches
    .map((b) => `- ${b.key}: ${b.description ?? b.key}`)
    .join("\n")
  const Result = z.object({
    outcome: z.enum(keys),
    reasoning: z
      .string()
      .describe("1-2 sentences explaining the signals that drove this branch"),
  })
  // On a resume, tell the model what we last sent so it can read the reply in
  // context (accepted the offer? still wants a refund? new question?).
  const prior = ctx.priorDecision
    ? `Earlier we sent this customer: ${ctx.priorDecision.decision}` +
      (ctx.priorDecision.template_used
        ? ` (${ctx.priorDecision.template_used})`
        : "") +
      `. The message below is their reply.\n\n`
    : ""
  const userText =
    `From: ${email.from_email}\n` +
    `Subject: ${email.subject}\n\n` +
    prior +
    `Options:\n${guide}\n\n` +
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
  if (!resp.parsed_output) throw new Error("reply_branch_parse_failed")
  return {
    outcome: resp.parsed_output.outcome,
    reasoning: resp.parsed_output.reasoning,
    usage: {
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
      cache_read_input_tokens: resp.usage.cache_read_input_tokens,
      cache_creation_input_tokens: resp.usage.cache_creation_input_tokens,
    },
  }
}

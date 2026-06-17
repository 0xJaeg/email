import { DraftStep } from "../steps/draft.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

// Terminal node: persist the decision + draft the customer reply (queued for
// human approval; never sent). Refund replies inherit the decision/template/
// proposed_actions computed upstream by refund_ladder (ctx.decision); other
// branches synthesize the decision from node.config { decision, template }.
// Reuses DraftStep so the decisions row + audit + reply generation are identical
// to the original pipeline. config.decision = "escalate" routes to needs_human.
export const SendReplyNode: NodeType = {
  type: "send_reply",
  async run(ctx, node) {
    if (!ctx.decision) {
      const cls = ctx.classification
      if (!cls) throw new Error("send_reply: classification missing")
      const cfg = node.config as { decision?: string; template?: string }
      ctx.decision = {
        decision: cfg.decision ?? "send_faq_reply",
        template_used: cfg.template ?? null,
        refund_request_count: null,
        combinedReasoning: cls.reasoning,
        llmModel: "claude-haiku-4-5",
      }
    }
    const patch = await DraftStep.run(ctx, toStepConfig(node))
    return { ...patch, outcome: "done" }
  },
}

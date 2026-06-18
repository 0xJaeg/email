import { decideRefund } from "../../refund-decision.js"
import type { NodeType } from "../types.js"

// Runs the refund offer-ladder / chargeback tree (refund-decision.ts) and routes
// by the ladder stage. Sets ctx.decision so the downstream send_reply node drafts
// with the right template + proposed_actions. Emits the decision as the outcome:
// send_offer_1 | send_offer_2 | issue_refund | issue_refund_chargeback.
export const RefundLadderNode: NodeType = {
  type: "refund_ladder",
  async run(ctx) {
    const cls = ctx.classification
    const r = await decideRefund({
      email: ctx.email,
      supabase: ctx.supabase,
      anthropic: ctx.anthropic,
      refundThreshold: ctx.product?.refundThreshold ?? null,
    })
    const combinedReasoning = r.sonnet_reasoning
      ? `${cls?.reasoning ?? ""}\n\nSonnet chargeback check: ${r.sonnet_reasoning}`
      : (cls?.reasoning ?? "")
    const decision = {
      decision: r.decision,
      template_used: r.template_used,
      refund_request_count: r.refund_request_count,
      combinedReasoning,
      llmModel: r.sonnet_usage
        ? "claude-haiku-4-5 + claude-sonnet-4-6"
        : "claude-haiku-4-5",
      sonnetUsage: r.sonnet_usage,
    }
    ctx.decision = decision
    return { decision, outcome: r.decision }
  },
}

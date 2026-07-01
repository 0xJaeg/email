import { countPriorRefunds } from "../../refund-decision.js"
import { normalizeEmailAddress } from "../../email-address.js"
import { DraftStep } from "../steps/draft.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

// Terminal refund node: drafts an issue_refund decision (refund + suppress
// proposed actions, via DraftStep) for human approval. The actual refund — and
// its success/failure — happens at approval in the dashboard (approvals.ts);
// this node NEVER calls refundCustomer. Reached when a customer declines the
// retention offer or still wants a refund after we tried to help.
export const RefundDraftNode: NodeType = {
  type: "refund_draft",
  async run(ctx, node) {
    const cls = ctx.classification
    if (!cls) throw new Error("refund_draft: classification missing")
    const priorRefunds = await countPriorRefunds(
      ctx.supabase,
      normalizeEmailAddress(ctx.email.from_email)
    )
    ctx.decision = {
      decision: "issue_refund",
      template_used: "REFUND_CONFIRMATION",
      refund_request_count: priorRefunds + 1,
      combinedReasoning: cls.reasoning,
      llmModel: "claude-haiku-4-5",
    }
    const patch = await DraftStep.run(ctx, toStepConfig(node))
    return { ...patch, outcome: "done" }
  },
}

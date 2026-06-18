import { decideRefund } from "../../refund-decision.js"
import type { Step, StepContext } from "../types.js"

// Step: choose the action. Refund requests run the offer-ladder / chargeback
// tree (refund-decision.ts); FAQ → reply; everything else → escalate.
export const DecideStep: Step = {
  key: "decide",
  async run(ctx) {
    return { decision: await decideOutcome(ctx) }
  },
}

async function decideOutcome(
  ctx: StepContext
): Promise<NonNullable<StepContext["decision"]>> {
  const cls = ctx.classification
  if (!cls) throw new Error("decide: classification missing")

  if (cls.classification === "refund_request") {
    const r = await decideRefund({
      email: ctx.email,
      supabase: ctx.supabase,
      anthropic: ctx.anthropic,
      productId: ctx.product?.productId ?? null,
    })
    const combinedReasoning = r.sonnet_reasoning
      ? `${cls.reasoning}\n\nSonnet chargeback check: ${r.sonnet_reasoning}`
      : cls.reasoning
    return {
      decision: r.decision,
      template_used: r.template_used,
      refund_request_count: r.refund_request_count,
      combinedReasoning,
      llmModel: r.sonnet_usage
        ? "claude-haiku-4-5 + claude-sonnet-4-6"
        : "claude-haiku-4-5",
      sonnetUsage: r.sonnet_usage,
    }
  }

  if (cls.classification === "faq") {
    return {
      decision: "send_faq_reply",
      template_used: null,
      refund_request_count: null,
      combinedReasoning: cls.reasoning,
      llmModel: "claude-haiku-4-5",
    }
  }

  return {
    decision: "escalate",
    template_used: null,
    refund_request_count: null,
    combinedReasoning: cls.reasoning,
    llmModel: "claude-haiku-4-5",
  }
}

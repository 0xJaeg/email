import { describe, it, expect } from "vitest"
import { buildFlowTrace } from "../flow-trace.js"
import type { ThreadDecision, ThreadAudit } from "../tickets.js"

function decision(overrides: Partial<ThreadDecision> = {}): ThreadDecision {
  return {
    id: "d1",
    classification: "faq",
    decision: "send_faq_reply",
    refundRequestCount: null,
    templateUsed: null,
    llmModel: "claude-haiku-4-5",
    llmReasoning: "Login support question, no refund intent.",
    status: "sent",
    draftReplyText: "Hi — let's get you back in.",
    approvedAt: "2026-06-16T07:26:08Z",
    approvedBy: "dev@unearthmedia.co",
    createdAt: "2026-06-15T05:32:21Z",
    context: {
      orders: [
        {
          orderId: "MOCK-1001",
          amount: 97,
          currency: "USD",
          productName: "Default Product",
          purchasedAt: "2026-05-01",
        },
      ],
      access: { hasAccess: true, details: "Your account is active." },
      inquiry_type: "existing_member",
    },
    proposedActions: [],
    ...overrides,
  }
}

const audit = (action: string, status = "success"): ThreadAudit => ({
  id: action,
  action,
  status,
  error: null,
  createdAt: "2026-06-15T05:32:00Z",
})

const sentAudit: ThreadAudit[] = [
  audit("webhook_received"),
  audit("gather_context"),
  audit("classify_email"),
  audit("reply_pending_approval"),
  audit("send_reply"),
]

describe("buildFlowTrace", () => {
  it("returns only the received step when there is no decision", () => {
    const steps = buildFlowTrace(null, [audit("webhook_received")])
    expect(steps.map((s) => s.key)).toEqual(["received"])
  })

  it("builds the full ordered trace for a sent FAQ reply", () => {
    const steps = buildFlowTrace(decision(), sentAudit)
    expect(steps.map((s) => s.key)).toEqual([
      "received",
      "spam",
      "classify",
      "gate",
      "lookup",
      "decide",
      "actions",
      "pending",
      "sent",
    ])
  })

  it("attaches the order + access to the lookup step", () => {
    const steps = buildFlowTrace(decision(), sentAudit)
    const lookup = steps.find((s) => s.key === "lookup")
    expect(lookup?.detail).toEqual({
      kind: "order-access",
      orders: [
        {
          orderId: "MOCK-1001",
          amount: 97,
          currency: "USD",
          productName: "Default Product",
          purchasedAt: "2026-05-01",
        },
      ],
      access: { hasAccess: true, details: "Your account is active." },
    })
  })

  it("carries the decision + reasoning on the decide step", () => {
    const steps = buildFlowTrace(decision(), sentAudit)
    const decide = steps.find((s) => s.key === "decide")
    expect(decide?.detail).toEqual({
      kind: "decision",
      value: "send_faq_reply",
      reasoning: "Login support question, no refund intent.",
    })
  })

  it("halts after the spam step when quarantined", () => {
    const steps = buildFlowTrace(
      decision({ decision: "quarantine_spam", classification: "spam", context: null }),
      [audit("webhook_received")]
    )
    expect(steps.map((s) => s.key)).toEqual(["received", "spam"])
    expect(steps[1]?.detail).toEqual({ kind: "text", text: "Quarantined as spam" })
  })

  it("lists proposed actions on a refund decision", () => {
    const steps = buildFlowTrace(
      decision({
        decision: "issue_refund",
        classification: "refund_request",
        status: "pending_approval",
        proposedActions: [{ type: "issue_refund" }, { type: "suppress_contact", reason: "refund" }],
      }),
      [audit("webhook_received"), audit("gather_context"), audit("classify_email"), audit("refund_pending_approval")]
    )
    const actions = steps.find((s) => s.key === "actions")
    expect(actions?.detail).toEqual({
      kind: "actions",
      actions: [{ type: "issue_refund" }, { type: "suppress_contact", reason: "refund" }],
    })
    expect(steps[steps.length - 1]?.key).toBe("pending")
  })

  it("skips the lookup step when no order was pulled, and marks the gate skipped", () => {
    const steps = buildFlowTrace(
      decision({ context: { inquiry_type: "pre_sale" } }),
      sentAudit
    )
    expect(steps.find((s) => s.key === "lookup")).toBeUndefined()
    const gate = steps.find((s) => s.key === "gate")
    expect(gate?.detail).toEqual({ kind: "text", text: "Skipped — no lookup needed" })
  })

  it("treats an empty orders array as no lookup", () => {
    const steps = buildFlowTrace(
      decision({ context: { orders: [], access: null } }),
      sentAudit
    )
    expect(steps.find((s) => s.key === "lookup")).toBeUndefined()
    expect(steps.find((s) => s.key === "gate")?.detail).toEqual({
      kind: "text",
      text: "Skipped — no lookup needed",
    })
  })

  it("marks the sent step failed when the send audit failed", () => {
    const steps = buildFlowTrace(decision({ status: "failed" }), [
      audit("webhook_received"),
      audit("gather_context"),
      audit("classify_email"),
      audit("reply_pending_approval"),
      audit("send_reply", "failure"),
    ])
    expect(steps.find((s) => s.key === "sent")?.status).toBe("failed")
  })
})

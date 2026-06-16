import type {
  ThreadDecision,
  ThreadAudit,
  DecisionOrder,
  DecisionAccess,
  ProposedAction,
} from "./tickets.js"

export type FlowStepStatus = "done" | "info" | "failed" | "pending"

export type FlowDetail =
  | { kind: "text"; text: string }
  | { kind: "classification"; value: string | null }
  | { kind: "order-access"; orders: DecisionOrder[]; access: DecisionAccess | null }
  | { kind: "decision"; value: string | null; reasoning: string | null }
  | { kind: "actions"; actions: ProposedAction[] }

export type FlowStep = {
  key: string
  title: string
  status: FlowStepStatus
  detail?: FlowDetail
  timestamp?: string
}

// Assembles the readable, every-step trace shown on the ticket page from the
// decision row (+ audit log for system-event timestamps/outcomes). Pure: no I/O.
// Spam-filter and lookup-gate OUTCOMES are inferred from the result, not stored.
export function buildFlowTrace(
  decision: ThreadDecision | null,
  audit: ThreadAudit[]
): FlowStep[] {
  const at = (action: string) => audit.find((a) => a.action === action)
  const steps: FlowStep[] = []

  const received = at("webhook_received")
  steps.push({
    key: "received",
    title: "Email received",
    status: received?.status === "failure" ? "failed" : "done",
    timestamp: received?.createdAt,
  })

  if (!decision) return steps

  // Spam check — quarantine halts the flow.
  if (decision.decision === "quarantine_spam") {
    steps.push({
      key: "spam",
      title: "Spam check",
      status: "done",
      detail: { kind: "text", text: "Quarantined as spam" },
    })
    return steps
  }
  steps.push({
    key: "spam",
    title: "Spam check",
    status: "done",
    detail: { kind: "text", text: "Not spam — continued" },
  })

  if (decision.classification) {
    steps.push({
      key: "classify",
      title: "Email classified",
      status: "done",
      detail: { kind: "classification", value: decision.classification },
    })
  }

  // Lookup gate + enrichment — inferred from whether context carries a result.
  const ctx = decision.context
  const ranLookup = !!(ctx && ((ctx.orders?.length ?? 0) > 0 || ctx.access))
  steps.push({
    key: "gate",
    title: "Order-lookup gate",
    status: "info",
    detail: {
      kind: "text",
      text: ranLookup ? "Lookup needed" : "Skipped — no lookup needed",
    },
  })
  if (ranLookup && ctx) {
    steps.push({
      key: "lookup",
      title: "Checked purchase & access",
      status: "done",
      detail: {
        kind: "order-access",
        orders: ctx.orders ?? [],
        access: ctx.access ?? null,
      },
    })
  }

  if (decision.decision) {
    steps.push({
      key: "decide",
      title: "Decided",
      status: "done",
      detail: {
        kind: "decision",
        value: decision.decision,
        reasoning: decision.llmReasoning,
      },
    })
  }

  steps.push({
    key: "actions",
    title: "Actions",
    status: decision.proposedActions.length > 0 ? "done" : "info",
    detail: { kind: "actions", actions: decision.proposedActions },
  })

  const pending = at("reply_pending_approval") ?? at("refund_pending_approval")
  if (pending) {
    steps.push({
      key: "pending",
      title:
        pending.action === "refund_pending_approval"
          ? "Refund waiting for approval"
          : "Reply waiting for approval",
      status: "done",
      timestamp: pending.createdAt,
    })
  }

  const sent =
    at("send_reply") ?? at("refund_customer") ?? at("refund_customer_stub")
  if (sent) {
    steps.push({
      key: "sent",
      title: sent.action === "send_reply" ? "Reply sent" : "Refund issued",
      status: sent.status === "failure" ? "failed" : "done",
      detail: decision.approvedBy
        ? { kind: "text", text: `Approved by ${decision.approvedBy}` }
        : undefined,
      timestamp: sent.createdAt,
    })
  }

  return steps
}

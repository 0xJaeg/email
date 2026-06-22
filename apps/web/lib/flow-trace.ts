import type {
  ThreadDecision,
  ThreadAudit,
  DecisionOrder,
  DecisionAccess,
  ProposedAction,
  FlowTraceStep,
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

type AuditLookup = (action: string) => ThreadAudit | undefined

// The ticket trace: "Email received" → the steps the agent took → lifecycle
// (waiting for approval / sent). When the worker recorded an EXACT path
// (flow_run_steps), render that; decisions made before flow_runs existed fall
// back to inferring the steps from the decision + audit log.
export function buildFlowTrace(
  decision: ThreadDecision | null,
  audit: ThreadAudit[]
): FlowStep[] {
  if (decision && (decision.path?.length ?? 0) > 0) {
    return buildPathTrace(decision, audit)
  }
  return buildInferredTrace(decision, audit)
}

function receivedStep(at: AuditLookup): FlowStep {
  const received = at("webhook_received")
  return {
    key: "received",
    title: "Email received",
    status: received?.status === "failure" ? "failed" : "done",
    timestamp: received?.createdAt,
  }
}

// Actions + approval/sent lifecycle — the tail shared by both trace builders.
function appendTail(
  steps: FlowStep[],
  at: AuditLookup,
  decision: ThreadDecision
): void {
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
}

// --- Real executed path (from flow_run_steps) ---

function buildPathTrace(
  decision: ThreadDecision,
  audit: ThreadAudit[]
): FlowStep[] {
  const at: AuditLookup = (action) => audit.find((a) => a.action === action)
  const steps: FlowStep[] = [receivedStep(at)]
  const path = decision.path ?? []
  path.forEach((s, i) => steps.push(nodeToStep(s, decision, i)))

  // A spam quarantine halts the flow — it's terminal, no action/approval tail.
  const quarantined = path.some(
    (s) => s.nodeType === "spam_filter" && s.outcome === "spam"
  )
  if (!quarantined) appendTail(steps, at, decision)
  return steps
}

function humanizeKey(key: string): string {
  const s = key.replace(/_/g, " ").trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Map one recorded node to a trace step, pulling the relevant detail from the
// decision. Unknown / future node types (e.g. api_action) render generically
// from the node key + outcome, so the trace never goes blank as the flow grows.
function nodeToStep(
  s: FlowTraceStep,
  decision: ThreadDecision,
  i: number
): FlowStep {
  const key = `${s.nodeKey}-${i}`
  switch (s.nodeType) {
    case "spam_filter":
      return {
        key,
        title: "Spam check",
        status: "done",
        detail: {
          kind: "text",
          text:
            s.outcome === "spam"
              ? "Quarantined as spam"
              : "Not spam — continued",
        },
      }
    case "classify":
      return {
        key,
        title: "Email classified",
        status: "done",
        detail: {
          kind: "classification",
          value: s.outcome ?? decision.classification,
        },
      }
    case "order_lookup":
      return {
        key,
        title: "Checked purchase & access",
        status: "done",
        detail: {
          kind: "order-access",
          orders: decision.context?.orders ?? [],
          access: decision.context?.access ?? null,
        },
      }
    case "refund_ladder":
      return {
        key,
        title: "Refund ladder",
        status: "done",
        detail: {
          kind: "decision",
          value: decision.decision,
          reasoning: decision.llmReasoning,
        },
      }
    case "send_reply":
      if (decision.decision === "escalate") {
        return {
          key,
          title: "Escalated to a human",
          status: "done",
          detail: {
            kind: "text",
            text: "Routed to a person for a manual reply",
          },
        }
      }
      return {
        key,
        title: "Drafted reply",
        status: "done",
        detail: {
          kind: "decision",
          value: decision.decision,
          reasoning: decision.llmReasoning,
        },
      }
    default:
      return {
        key,
        title: humanizeKey(s.nodeKey),
        status: "done",
        detail: s.outcome ? { kind: "text", text: `→ ${s.outcome}` } : undefined,
      }
  }
}

// --- Inference fallback (decisions made before flow_runs existed) ---
// Spam-filter and lookup-gate OUTCOMES are inferred from the result, not stored.

function buildInferredTrace(
  decision: ThreadDecision | null,
  audit: ThreadAudit[]
): FlowStep[] {
  const at: AuditLookup = (action) => audit.find((a) => a.action === action)
  const steps: FlowStep[] = [receivedStep(at)]

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
  const foundOrder = (ctx?.orders?.length ?? 0) > 0
  // An access RECORD means the lookup ran — NOT that access was granted; a
  // found-but-no-access result (hasAccess: false) still means enrichment happened.
  const gotAccessRecord = !!ctx?.access
  const ranLookup = foundOrder || gotAccessRecord
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

  appendTail(steps, at, decision)
  return steps
}

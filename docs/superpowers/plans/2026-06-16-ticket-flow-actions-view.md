# Per-ticket Decision-Flow & Actions View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the ticket page's existing "What the assistant did" timeline into a readable, every-step trace showing what each step found, the model's reasoning, and the resulting actions.

**Architecture:** A pure function `buildFlowTrace(decision, audit)` assembles an ordered `FlowStep[]` from data the `decisions` row already holds (`context`, `classification`, `llm_reasoning`, `proposed_actions`) plus the `audit_log`. A presentational `ThreadFlow` component renders those steps (reusing existing badges). No worker or schema changes; spam-filter / lookup-gate outcomes are inferred from the result.

**Tech Stack:** Next.js 16 App Router (React 19, Server Components), TypeScript (NodeNext), Supabase JS, Vitest. Run from repo root.

**Branch:** Work on a feature branch off `main` (e.g. `feat/ticket-flow-view`); do not commit to `main`.

**Spec:** `docs/superpowers/specs/2026-06-16-ticket-flow-actions-view-design.md`

---

## File Structure

- **Modify** `apps/web/lib/tickets.ts` — add `DecisionOrder` / `DecisionAccess` / `DecisionContext` / `ProposedAction` types; add `context` + `proposedActions` to `ThreadDecision`; fetch + map them in `getThreadDetail`.
- **Create** `apps/web/lib/flow-trace.ts` — `FlowStep` / `FlowStepStatus` / `FlowDetail` types + the pure `buildFlowTrace()` assembler.
- **Create** `apps/web/lib/__tests__/flow-trace.test.ts` — unit tests for `buildFlowTrace`.
- **Create** `apps/web/components/tickets/thread-flow.tsx` — presentational timeline rendering `FlowStep[]` (replaces `thread-audit.tsx`).
- **Modify** `apps/web/app/(overview)/tickets/[id]/page.tsx` — build the trace and render `<ThreadFlow>`.
- **Delete** `apps/web/components/tickets/thread-audit.tsx` — its only consumer is the ticket page.

---

## Task 1: Data layer — fetch `context` + `proposed_actions`

**Files:**
- Modify: `apps/web/lib/tickets.ts` (type `ThreadDecision` at lines 129-142; `getThreadDetail` select at line 185; mapping at lines 202-215)

- [ ] **Step 1: Add the decision data-shape types**

In `apps/web/lib/tickets.ts`, immediately above `export type ThreadDecision = {` (line 129), add:

```ts
export type DecisionOrder = {
  orderId: string
  amount: number
  currency: string
  productName: string
  purchasedAt: string
}

export type DecisionAccess = {
  hasAccess: boolean
  details: string
}

export type DecisionContext = {
  orders?: DecisionOrder[]
  access?: DecisionAccess | null
  inquiry_type?: string
}

export type ProposedAction = {
  type: string
  reason?: string
}
```

- [ ] **Step 2: Add the two fields to `ThreadDecision`**

In the `ThreadDecision` type, add these two lines after `createdAt: string`:

```ts
  context: DecisionContext | null
  proposedActions: ProposedAction[]
```

- [ ] **Step 3: Fetch the columns in `getThreadDetail`**

In the `.select(...)` string (line 185), inside the `decisions(...)` embed, change the trailing `approved_by, created_at)` to:

```
approved_by, created_at, context, proposed_actions)
```

- [ ] **Step 4: Map the two new fields**

In the decisions `.map((d) => ({ ... }))` (lines 202-215), add after `createdAt: d.created_at,`:

```ts
        context: (d.context ?? null) as DecisionContext | null,
        proposedActions: (d.proposed_actions ?? []) as ProposedAction[],
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS. (If it reports `context`/`proposed_actions` are not on the decisions row type, the generated DB types are stale — regenerate with `pnpm --filter @workspace/db gen-types`, or as a fallback cast the row: `const dd = d as typeof d & { context: unknown; proposed_actions: unknown }` and read from `dd`.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/tickets.ts
git commit -m "feat(web): fetch decision context + proposed_actions for ticket detail"
```

---

## Task 2: `buildFlowTrace` (pure assembler) — TDD

**Files:**
- Create: `apps/web/lib/flow-trace.ts`
- Test: `apps/web/lib/__tests__/flow-trace.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/__tests__/flow-trace.test.ts`:

```ts
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
    // No send step yet (pending approval), so the last step is the pending one.
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test flow-trace`
Expected: FAIL — `buildFlowTrace` is not defined / module `../flow-trace.js` not found.

- [ ] **Step 3: Implement `buildFlowTrace`**

Create `apps/web/lib/flow-trace.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test flow-trace`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/flow-trace.ts apps/web/lib/__tests__/flow-trace.test.ts
git commit -m "feat(web): add buildFlowTrace assembler for ticket decision trace"
```

---

## Task 3: `ThreadFlow` component

**Files:**
- Create: `apps/web/components/tickets/thread-flow.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/components/tickets/thread-flow.tsx`. It reuses the dot/connector/failure visuals from `thread-audit.tsx` and renders each step's `detail`:

```tsx
import { cn } from "@workspace/ui/lib/utils"
import { IconCheck, IconClock, IconX, IconMinus } from "@tabler/icons-react"
import { humanizeAction } from "@/lib/activity-format"
import { ClassificationBadge, DecisionBadge } from "@/components/shared/status-badges"
import type { FlowStep, FlowStepStatus } from "@/lib/flow-trace"

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function StepDot({ status }: { status: FlowStepStatus }) {
  if (status === "failed")
    return (
      <span className="bg-destructive text-background grid size-6 place-items-center rounded-full">
        <IconX className="size-3.5" stroke={2.5} />
      </span>
    )
  if (status === "pending")
    return (
      <span className="bg-background text-muted-foreground grid size-6 place-items-center rounded-full border">
        <IconClock className="size-3.5" />
      </span>
    )
  if (status === "info")
    return (
      <span className="bg-background text-muted-foreground grid size-6 place-items-center rounded-full border">
        <IconMinus className="size-3.5" />
      </span>
    )
  return (
    <span className="grid size-6 place-items-center rounded-full bg-emerald-500 text-white">
      <IconCheck className="size-3.5" stroke={2.5} />
    </span>
  )
}

function StepDetail({ detail }: { detail: FlowStep["detail"] }) {
  if (!detail) return null
  if (detail.kind === "text")
    return <p className="text-muted-foreground text-sm">{detail.text}</p>
  if (detail.kind === "classification")
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Classified as</span>
        <ClassificationBadge value={detail.value} />
      </div>
    )
  if (detail.kind === "decision")
    return (
      <div className="flex flex-col gap-2">
        <DecisionBadge value={detail.value} />
        {detail.reasoning ? (
          <p className="text-muted-foreground border-border max-w-[60ch] border-l-2 pl-3 text-sm italic">
            “{detail.reasoning}”
          </p>
        ) : null}
      </div>
    )
  if (detail.kind === "order-access")
    return (
      <div className="flex flex-col gap-2">
        {detail.orders.length === 0 ? (
          <p className="text-muted-foreground text-sm">No matching order found.</p>
        ) : (
          detail.orders.map((o) => (
            <div
              key={o.orderId}
              className="bg-muted/40 text-muted-foreground flex w-fit flex-wrap gap-x-3.5 gap-y-1 rounded-lg border px-3 py-2 text-sm"
            >
              <span className="text-foreground font-medium">{o.orderId}</span>
              <span>
                {o.currency} {o.amount}
              </span>
              <span>{o.productName}</span>
              <span>purchased {o.purchasedAt}</span>
            </div>
          ))
        )}
        {detail.access ? (
          <p
            className={cn(
              "text-sm",
              detail.access.hasAccess ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
            )}
          >
            {detail.access.hasAccess ? "✓ Access active" : "✗ No access"} — {detail.access.details}
          </p>
        ) : null}
      </div>
    )
  // detail.kind === "actions"
  if (detail.actions.length === 0)
    return <p className="text-muted-foreground text-sm">None — reply only.</p>
  return (
    <div className="flex flex-wrap gap-2">
      {detail.actions.map((a, i) => (
        <span
          key={`${a.type}-${i}`}
          className="bg-muted text-foreground w-fit rounded-md px-2 py-1 text-xs"
        >
          {humanizeAction(a.type)}
        </span>
      ))}
    </div>
  )
}

// The agent's run on this ticket, step by step, with what each step found.
export function ThreadFlow({ steps }: { steps: FlowStep[] }) {
  if (steps.length === 0) return null

  return (
    <section className="flex flex-col gap-3.5">
      <h2 className="text-muted-foreground font-heading text-[11px] font-semibold tracking-wider uppercase">
        What the assistant did
      </h2>
      <ol className="bg-card divide-border divide-y rounded-xl border">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className={cn(
              "flex gap-3.5 px-4 py-3.5",
              s.status === "failed" && "bg-destructive/5"
            )}
          >
            <div className="flex flex-col items-center">
              <StepDot status={s.status} />
              {i < steps.length - 1 && (
                <span className="bg-border mt-1 w-px flex-1" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-heading text-sm font-medium">{s.title}</span>
                {s.timestamp ? (
                  <span
                    suppressHydrationWarning
                    className="text-muted-foreground ml-auto text-xs tabular-nums"
                  >
                    {formatDateTime(s.timestamp)}
                  </span>
                ) : null}
              </div>
              <StepDetail detail={s.detail} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/tickets/thread-flow.tsx
git commit -m "feat(web): add ThreadFlow timeline component"
```

---

## Task 4: Wire into the ticket page + remove `thread-audit.tsx`

**Files:**
- Modify: `apps/web/app/(overview)/tickets/[id]/page.tsx`
- Delete: `apps/web/components/tickets/thread-audit.tsx`

- [ ] **Step 1: Swap the import**

In `apps/web/app/(overview)/tickets/[id]/page.tsx`, replace the import line:

```tsx
import { ThreadAudit } from "@/components/tickets/thread-audit"
```

with:

```tsx
import { ThreadFlow } from "@/components/tickets/thread-flow"
import { buildFlowTrace } from "@/lib/flow-trace"
```

- [ ] **Step 2: Build the trace and render it**

In the same file, the current code computes `auditEntries` and renders `<ThreadAudit entries={auditEntries} />`. Replace the render:

```tsx
          <ThreadAudit entries={auditEntries} />
```

with (build the trace from the latest decision + the thread's audit entries):

```tsx
          <ThreadFlow steps={buildFlowTrace(latestDecision, auditEntries)} />
```

`latestDecision` and `auditEntries` already exist in this component (lines 30-35). Leave them as-is.

- [ ] **Step 3: Delete the now-unused component**

```bash
git rm apps/web/components/tickets/thread-audit.tsx
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter web typecheck`
Expected: PASS.

Run: `pnpm --filter web build`
Expected: PASS — all routes compile, including `/tickets/[id]`.

- [ ] **Step 5: Manual verification**

Start the app (`pnpm --filter web dev`), open `/tickets/f8289fa5-112b-4d4c-8fe4-11ae440ba973`.
Expected: the "What the assistant did" timeline now shows Email received → Spam check (Not spam) → Email classified (FAQ) → Order-lookup gate (Lookup needed) → Checked purchase & access (MOCK-1001 · $97 · access active) → Decided (FAQ reply + reasoning quote) → Actions (None — reply only) → Reply waiting for approval → Reply sent (Approved by …).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/(overview)/tickets/[id]/page.tsx
git commit -m "feat(web): render decision-flow trace on ticket detail; drop thread-audit"
```

---

## Self-Review

**Spec coverage:**
- Enrich existing timeline in place (not a new panel) → Tasks 3-4 (ThreadFlow replaces ThreadAudit under the same "What the assistant did" heading). ✓
- Every step + inline detail, no collapse → Task 2 step model + Task 3 renderer. ✓
- Approach A sourcing, no worker/schema change, inferred spam/gate → Task 2 (`buildFlowTrace` reads existing fields; gate/spam inferred). ✓
- Fetch `context` + `proposed_actions` → Task 1. ✓
- Edge cases (null decision, spam halt, refund actions, no-order, failed send) → Task 2 tests. Escalate (`needs_human`) renders via the decide step's `DecisionBadge` (value `escalate`) with no send step — covered by the general path; ✓.
- Reuse existing badges, don't duplicate label maps → Task 3 (`ClassificationBadge`/`DecisionBadge`/`humanizeAction`). ✓
- Tests → Task 2 (pure unit tests); component verified by typecheck/build/manual (repo has no RTL infra — faithful to existing pattern). ✓

**Placeholder scan:** none — every step has exact paths, real code, and concrete commands.

**Type consistency:** `ThreadDecision.context: DecisionContext | null` / `proposedActions: ProposedAction[]` (Task 1) are consumed by `buildFlowTrace` (Task 2); `FlowStep`/`FlowDetail` (Task 2) are consumed by `ThreadFlow` (Task 3); `buildFlowTrace` + `ThreadFlow` are imported in the page (Task 4). Names match across tasks.

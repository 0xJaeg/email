# Per-ticket decision-flow & actions view — design

**Date:** 2026-06-16
**Status:** Approved design (brainstorm) → ready for implementation plan

## Goal / context

Ben's #1 ask from the 2026-06-11 call: the agent's decision-making must not be a black box — he wants to **see every step the agent takes on a ticket** (spam check, classify, order lookup, access check, the branch, and the actions). See the v2 roadmap (`~/.claude/plans/context-i-m-evaluating-hashed-lollipop.md`, §1–2).

Today `/(overview)/tickets/[id]` shows the final decision (`VerdictBanner`) and a coarse **"What the assistant did"** audit timeline (`thread-audit.tsx`, fed by `audit_log`), but **not** what each step found, the model's reasoning, or the proposed/taken actions. The rich data already exists on the `decisions` row (`context`, `llm_reasoning`, `classification`, `proposed_actions`) — it's just not fetched or displayed.

This feature **enriches the existing "What the assistant did" timeline in place** into a readable, every-step trace.

## Decisions (from brainstorm)

- **Enrich the existing timeline in place** — do NOT add a second panel (two timelines narrating the agent's run would be redundant).
- **Audience / altitude:** Ben-facing readable trace. Every step shown in flow order, each with its outcome + what it found + reasoning + resulting actions. Polished, not raw. **No expand/collapse for v1** (chosen option A, not layered).
- **Sourcing (Approach A):** reconstruct the trace from data the decision already holds + the audit log. **No worker or schema changes.** The spam-filter and lookup-gate outcomes are **inferred** from the result (not their actual AI reasoning).

## Steps rendered (flow order)

| Step | Source | Detail shown |
|---|---|---|
| Email received | audit `webhook_received` | timestamp |
| Spam check | inferred (`decision ≠ quarantine_spam`) | "Not spam — continued" / "Quarantined as spam" (halt) |
| Email classified | `decisions.classification` | e.g. "FAQ" / "refund request" |
| Order-lookup gate | inferred (enrichment ran / `context.inquiry_type`) | "Lookup needed" / "Skipped — pre-sale" |
| Checked purchase & access | `decisions.context.orders` + `.access` | order id · amount · product · purchased; access ✓/✗ + detail |
| Decided | `decisions.decision` + `llm_reasoning` | decision label + reasoning quote |
| Actions | `decisions.proposed_actions` | list (e.g. `issue refund`, `suppress contact`); "None — reply only" if empty |
| Reply waiting for approval | audit `reply_pending_approval` / `refund_pending_approval` | timestamp |
| Reply sent / Refund issued | audit `send_reply` / status `sent`\|`approved` | approved_by + timestamp |

Steps with no applicable data are skipped (e.g. a spam-quarantine halts the flow → only Received + Spam check shown).

## Architecture / files

- **`apps/web/lib/tickets.ts`**
  - Extend the `getThreadDetail` select to fetch `context` and `proposed_actions` on decisions.
  - Add `context` + `proposedActions` to the `ThreadDecision` type and its mapping.
  - New **pure** function `buildFlowTrace(decision: ThreadDecision | null, audit: ThreadAudit[]): FlowStep[]` — assembles the ordered steps from the decision + audit. No DB calls; unit-testable in isolation.
  - New `FlowStep` type: `{ key, title, status: "done" | "info" | "failed" | "pending", detail?: FlowDetail, timestamp?: string }`, where `FlowDetail` is a small discriminated shape (`text` | `chips` | `order-access` | `reasoning` | `actions`).
- **`apps/web/components/tickets/thread-flow.tsx`** (replaces `thread-audit.tsx`)
  - Renders `FlowStep[]`, reusing the current dot / connector-line / failure visuals from `thread-audit.tsx`, plus a `detail` slot per step. Heading stays **"What the assistant did"**.
  - `thread-audit.tsx`'s only consumer is the ticket page, so it is removed as part of this change.
- **`apps/web/app/(overview)/tickets/[id]/page.tsx`**
  - Build the trace (`buildFlowTrace(latestDecision, auditEntries)`) and render `<ThreadFlow steps=… />` in place of `<ThreadAudit>`.
- **`VerdictBanner`** unchanged — stays the page headline (decision + reasoning). To avoid heavy duplication, the "Decided" step shows the decision label and a condensed reasoning; the full reasoning quote remains in the banner. (Minor; finalize during implementation.)

## Data flow

`page` (Server Component) → `getThreadDetail` (now returns `context` + `proposedActions`) → `buildFlowTrace(latestDecision, audit)` → `<ThreadFlow steps>`. All server-rendered; the page is already `force-dynamic`. No realtime for v1.

## Edge cases

- **No decision yet** → trace shows Email received (+ any audit); decision steps omitted. `VerdictBanner` already handles the empty case.
- **Spam / quarantine** → Received → Spam check (quarantined), halt; no later steps.
- **Refund** → Decided shows offer/refund + reasoning; Actions lists `issue_refund` / `suppress_contact`; status `pending_approval`.
- **Escalate** → Decided = "Escalate to a human"; status `needs_human`.
- **No order found** → order/access detail shows "No matching order"; access row omitted when `context.access` is absent.
- **Failed step** → preserve the existing destructive failure styling + error text from the audit entry.
- **Multi-email thread** → v1 builds the trace for the **latest decision** across the thread's emails (matches the existing `latestDecision` the banner uses). Per-email traces are a later enhancement.

## Testing

- **Unit (`buildFlowTrace`)** — fixtures: FAQ-sent (this ticket), refund `pending_approval` (proposed_actions populated), spam quarantine (halt), escalate (`needs_human`), no-order, `decision = null`, and a failed audit step. Assert step order, statuses, and detail mapping.
- **Component render** — `ThreadFlow` renders the detail rows and preserves failure styling.
- **Manual** — open `/tickets/f8289fa5-112b-4d4c-8fe4-11ae440ba973`; confirm the enriched steps + detail match the data.

## Non-goals / follow-ups

- No worker or schema changes (Approach A).
- Persisting the **real** spam-filter / lookup-gate reasoning (Approach C) — deferred.
- Expand/collapse "layered" detail (option C) — deferred; easy to add later if the inline view feels verbose.
- Per-email traces and realtime updates — deferred.

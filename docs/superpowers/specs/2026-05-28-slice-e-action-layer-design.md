# Slice E — Action Layer & Refund Approval Queue (Design)

**Status:** Approved 2026-05-28 (brainstorming complete; pending implementation plan).
**Supersedes:** the action-layer description in `docs/initial-plan.md` step 4.
**Depends on:** slices A (foundation), B (ingestion), C (classifier), D (refund decision tree) — built and verified end-to-end against live models on 2026-05-27.

## Context

The agent today *decides* but doesn't *act*. The worker writes `decisions.decision` rows (`send_offer_1`, `send_offer_2`, `issue_refund`, `issue_refund_chargeback`, `send_faq_reply`, `escalate`) but no outbound reply gets sent and no refund is issued. Slice E closes the loop — every decision becomes a sent reply or an audited stub-refund — with one firm rule: **refunds always require explicit human approval before any ClickBank call fires** (project memory: `refunds-require-manual-approval`).

## Goals

1. **`sendReply` action** — send the agent's reply via the Agent Mail outbound API.
2. **`refundCustomer` action** — ClickBank refund call. Real API is deferred; slice E ships with a **stub** that audits the intended refund + would-be parameters and returns success.
3. **Refund approval queue** — a dashboard route `/approvals` where pending refund decisions surface; a human clicks Approve or Reject; only on Approve does the stub-refund fire + the confirmation reply send.
4. **Auto-send for non-refund replies** — FAQ replies, Offer 1, Offer 2 fire from the worker without human approval.
5. **`instructions/` store reconciled** with the approval semantics; C/D re-verified after the rewording.

## Non-goals (this slice)

- Real ClickBank API integration (stub-only; swap when credentials/sandbox land — signature unchanged).
- Inline reply editing in the approval UI (v1.5 manual composer).
- Per-category autonomy toggle (FAQ + offers always auto, refunds always queued, in MVP).
- Notifications (Slack / email) when refunds enter the queue.
- Auth on `/approvals` — uses the existing permissive anon-RLS placeholder. **Known MVP gap; restrict before any deploy.**

## Architecture

```
                                                           ┌──> Agent Mail send (sendReply)
Webhook (B) → classify (C) → decide (D) ──────────────────┤
                                                           ↓
                                                refund? → status='pending_approval'
                                                          + draft_reply_text (LLM pre-gen)
                                                  ↑
                                              Realtime
                                                  ↓
              Dashboard ──┬─ Live feed (existing slice F)
                          └─ /approvals (new) — pending_approval refunds
                                ├─ Approve → server action → refundCustomer + sendReply → status='sent'
                                └─ Reject  → server action → status='rejected'
```

### New / changed pieces

- **`packages/actions` (new shared package)** — exports `sendReply` and `refundCustomer`. Imported by both worker (auto-send for non-refund) and web (approval handler). Audit-logged.
- **`apps/worker` (extend processor)** — non-refund branches: `generateReply` → `sendReply` → `status='sent'`. Refund branches: `generateReply` (draft) → `status='pending_approval'` + persisted draft. `escalate`: `status='needs_human'`, no auto-send.
- **`apps/web` (new route + actions)** — `/approvals` SSR page; server actions `approveRefund(decisionId)` / `rejectRefund(decisionId, reason?)`.
- **`packages/db` (new migration)** — 4 columns added to `decisions`; existing realtime publication picks them up.
- **`instructions/` (in-scope rewording)** — `policies/refund.md`, `tone/voice.md`, `policies/common-questions.md` reconciled to the approval semantics; C/D re-verified after.

## Data model

Migration adds to `decisions`:

| Column | Type | Notes |
|---|---|---|
| `status` | `text not null default 'pending_action'` | Enum-ish (text for ease): `pending_action` / `pending_approval` / `approved` / `rejected` / `sent` / `failed` / `needs_human` |
| `draft_reply_text` | `text` (nullable) | LLM-generated reply body. Required for refunds (pre-gen); also cached for non-refund replies post-send for audit. |
| `approved_at` | `timestamptz` (nullable) | Set on Approve or Reject. |
| `approved_by` | `text` (nullable) | Approver identifier. `'mvp-operator'` placeholder for MVP; auth-sub when auth lands. |

State machine:

```
pending_action ──(worker, non-refund)──> sent | failed
pending_action ──(worker, refund)──────> pending_approval ──approve──> approved ──actions──> sent | failed
                                                            └─reject──> rejected
pending_action ──(worker, escalate)────> needs_human
```

## Data flow

### Non-refund (auto-send)

1. Worker classifies + decides (existing C/D path); writes decision row at `pending_action`.
2. `generateReply(template, email)` → Haiku 4.5 with the cached `INSTRUCTIONS_TEXT` block → reply body. Stored as `draft_reply_text`.
3. `sendReply({ threadId, replyText, originalMessageId, decisionId })` → Agent Mail outbound → `sentMessageId`.
4. `status='sent'`; audit log `action='send_reply'`, payload = `{ sentMessageId, usage }`.

### Refund (queued)

1. Steps 1–2 as above, with the refund template (`REFUND_CONFIRMATION` or `REFUND_CHARGEBACK_APOLOGY`).
2. `status='pending_approval'`; audit log `action='refund_pending_approval'`, payload includes draft preview + reasoning.
3. `/approvals` SSR fetches `decisions WHERE status='pending_approval'` → list with sender, subject, AI reasoning, draft preview, Approve / Reject buttons.
4. **Approve** → server action `approveRefund(decisionId)`:
   - `refundCustomer({ decisionId, customerEmail, orderId, amount })` → stub returns `{ ok: true, refundId: 'stub-<uuid>' }`.
   - On refund success: `sendReply({ threadId, replyText: draft_reply_text, originalMessageId, decisionId })`.
   - `status='sent'`, `approved_at=now()`, `approved_by='mvp-operator'`.
   - On any failure: `status='failed'`; audit payload identifies which step failed.
5. **Reject** → `rejectRefund(decisionId, reason?)`:
   - `status='rejected'`, `approved_at=now()`, `approved_by='mvp-operator'`; audit reason.

## Action contracts (sketched)

```ts
// packages/actions/src/sendReply.ts
export type SendReplyArgs = {
  threadId: string
  replyText: string
  originalMessageId: string
  decisionId: string
  supabase: ServerClient
  agentMail: AgentMailClient
}
export type SendReplyResult =
  | { ok: true; sentMessageId: string }
  | { ok: false; error: string }
export async function sendReply(args: SendReplyArgs): Promise<SendReplyResult>
```

```ts
// packages/actions/src/refundCustomer.ts
export type RefundCustomerArgs = {
  decisionId: string
  customerEmail: string
  orderId: string | null     // best-effort regex; null is fine for stub
  amount: number | null
  supabase: ServerClient
}
export type RefundCustomerResult =
  | { ok: true; refundId: string }   // stub: 'stub-<uuid>'
  | { ok: false; error: string }
export async function refundCustomer(args: RefundCustomerArgs): Promise<RefundCustomerResult>
```

```ts
// apps/worker/src/lib/generate-reply.ts
export type GenerateReplyArgs = {
  template:
    | 'FAQ_REPLY'
    | 'OFFER_1' | 'OFFER_2'
    | 'REFUND_CONFIRMATION' | 'REFUND_CHARGEBACK_APOLOGY'
  email: { from_email: string; subject: string; body_text: string | null }
  anthropic: Anthropic
}
// Calls Haiku 4.5 with INSTRUCTIONS_TEXT cached + per-email user message:
//   "Compose a {TEMPLATE} reply to this email. Follow the policy and voice
//    guidance in the system prompt. Plain text only."
// Returns: { text, usage }
```

Cached instructions block (~4844 tokens, above Haiku's 4096-token cache floor) is the same one used by C/D — cache reuse stays confirmed. Reply gen ≈ $0.0001 / decision.

## Error handling

- **`generateReply` fails** — job throws → BullMQ retry/dead-letter (existing). Decision stays `pending_action`; audit `generate_reply_failed`.
- **`sendReply` fails** (worker, non-refund): `status='failed'`; audit captures the Agent Mail error. Manual retry deferred to v1.5.
- **`refundCustomer` fails** (real-API era): keep `pending_approval` so a human can retry; no reply sent.
- **`sendReply` fails after `refundCustomer` succeeded**: ordering is **refund first, notify second**. A successful refund is never lost. `status='failed'` + audit payload identifies which step failed; ops can manually re-notify (v1.5 surface, or a one-off script in the meantime).
- **Approve race** (two browser tabs hitting Approve on the same row): server action does a conditional update — `UPDATE decisions SET status='approved' WHERE id=? AND status='pending_approval'`. Zero rows affected → "already handled" surfaced in the UI; race is audited.
- **Webhook / classification pipeline failures** — unchanged from B/C/D (existing retries, dead-letter, audit log).

## Testing strategy

End-to-end via the existing `pnpm sim` harness. Drive each scenario and capture observable evidence (per the `verify` skill — run the real surface, capture, don't substitute typecheck/lint).

| Scenario | Expected `status` | Outbound observable |
|---|---|---|
| `sim faq` | `sent` | Agent Mail outbound captured; `draft_reply_text` populated. |
| `sim refund1` (clean Alice) | `sent` | Offer 1 reply sent. |
| `sim refund2` | `sent` | Offer 2 reply sent. |
| `sim refund3` (after 1+2) | `pending_approval` → after browser Approve → `sent` | Stub refund logged; confirmation reply sent. |
| `sim chargeback × 2` (Bob) | First: `sent` (Offer 1). Second: `pending_approval` (Sonnet, `REFUND_CHARGEBACK_APOLOGY`) → Approve → `sent`. | Sonnet usage on the second; stub refund + confirmation sent. |
| `sim other` | `needs_human` | No outbound. |
| Negative: bad `AGENT_MAIL_API_KEY` | `failed` | Audit captures the Agent Mail error. |
| Race: two `/approvals` tabs Approve same row | First wins; second shows "already handled". | Audit logs the race. |

After the in-scope `instructions/` rewording, **re-run the full C/D sim verification** (7 scenarios — labels, refund ladder, Sonnet, cache reuse). Any classifier-behavior drift means the rewording needs tuning before slice E ships.

## In-scope `instructions/` rewording

The agent's system-prompt store presumes auto-execute language; reconcile to the approval semantics. Decision rule: **the policy outcome ("refund this customer") is unchanged — only the execution wording shifts to "the refund decision is recorded; the operator confirms before money moves."**

- `instructions/policies/refund.md` lines ~25, 33 — "issues the refund" / "issue an immediate refund + apology".
- `instructions/tone/voice.md` line ~40 — `"refund issued. You'll see $97 back..."` example (the reply is sent *after* approval, so this remains accurate as the confirmation text — but the surrounding "On refund replies specifically" guidance should note that the reply runs after approval).
- `instructions/policies/common-questions.md` line ~39 — "refund the second charge immediately" for duplicate charges. **Decision: duplicate-charge refunds also queue for approval** (no carve-outs); reword to match.

After rewording: re-verify C/D end-to-end. If classifier or decision-tree behavior shifts, tune the wording until it doesn't.

## Out of scope / follow-ups

- **Real ClickBank API** — swap stub when credentials/sandbox land; signature stays.
- **Reply editing in approval UI** — v1.5 manual composer.
- **Per-category autonomy toggle** — defer.
- **`/approvals` auth** — restrict route + RLS when auth lands. **MVP gap.**
- **Notifications** when refunds enter the queue — none in MVP.
- **Manual retry UI** for failed sends / partial failures — v1.5.

## Implementation order (sketch — detailed plan via `writing-plans`)

1. Add Agent Mail outbound SDK (or REST client) and `AGENT_MAIL_API_KEY` env var.
2. New `packages/actions` package — `sendReply` + `refundCustomer` (stub).
3. Schema migration — 4 columns on `decisions` + status-default for existing rows.
4. Worker — `generateReply` helper + branching auto-send / queue paths.
5. `instructions/` rewording + re-verify C/D (gate before slice E ships).
6. `/approvals` route + server actions; dashboard sidebar entry.
7. Full end-to-end verification per the testing strategy.

## References

- `docs/initial-plan.md` — MVP spec (refund workflow, cost model, current status).
- Project memory `refunds-require-manual-approval` — the firm rule that gates this design.
- `CLAUDE.md` — current code state, working-style principles, conventions.
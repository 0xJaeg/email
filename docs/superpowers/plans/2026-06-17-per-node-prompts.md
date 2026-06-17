# Per-Node Prompts (remove the shared `/prompts` layer) — Implementation Plan

> Execute in a FRESH session (not at the tail of the marathon session it was planned in). It rewrites how every reply is generated, so guard hard against reply-quality regressions.

**Decision (2026-06-17):** prompts go **fully per-node**. Each flow node carries its complete *editable* prompt in `flow_nodes.ai_prompt`; the shared `prompt_configs` layer + the `/prompts` page are removed. The non-editable **safety framing stays hard-coded in the worker** (it is not a "prompt").

**Goal:** one place to manage prompts (the flow), no separate `/prompts` page — without losing the reply guardrails, tone, or policy content.

**Accepted cost:** changing shared wording (e.g. the refund policy) later means editing it in each reply node (~7), and node prompts get large (~8KB). The user accepted this in exchange for self-contained, in-flow prompts.

---

## Architecture change

Today: `getInstructions(supabase, productId)` fetches `prompt_configs`, assembles two strings — `classifier` (`HEADER` + all kinds) and `reply` (`REPLY_HEADER` + tone + policy_refund + policy_faq) — cached per product; a node's `ai_prompt` *overrides* the assembled string.

After: the worker keeps only the two hard-coded framing constants and uses `node.ai_prompt` as the body.
- `classify` node prompt = `HEADER` + `node.ai_prompt`
- `send_reply` (reply) prompt = `REPLY_HEADER` + `node.ai_prompt`
- No `prompt_configs` fetch, no assembly, no per-product prompt resolution. `StepContext.instructions` is removed.

`HEADER` and `REPLY_HEADER` (in `apps/worker/src/lib/instructions.ts`) are **kept** — `REPLY_HEADER` is the safety rail (no JSON, no internal/template leakage, never invent URLs, write as a human). They were never on `/prompts`.

---

## Migration (behavior-preserving FIRST, then optionally lean down)

**Step A — populate each prompt-driven node's `ai_prompt` so replies don't change.** The current effective editable content (the `prompt_configs` bodies, sans the hard-coded header) is baked into the nodes. Source content lives in `instructions/` markdown + the live `prompt_configs` rows (export them first):
- `classify` node → the classifier-rubric content (today's `classifier` assembly is `HEADER` + all 5 kinds; for an exact preserve, concatenate the same kinds; a leaner classify prompt = rubric + categories only is a *deliberate* follow-up, not part of the behavior-preserving pass).
- each `send_reply` node (`reply_sales`, `reply_login`, `reply_no_order`, `reply_general`, `reply_unsubscribe`, `reply_refund`) → `tone` + `policy_refund` + `policy_faq` + its existing node snippet.
- `spam_filter` / `lookup_gate` are unaffected (they use their own hard-coded `DEFAULT_PROMPT`, not `prompt_configs`).
Do this as a data migration (UPDATE `flow_nodes` SET ai_prompt) applied to dlwc via the Supabase MCP + a repo migration file.

**Step B — rewire the worker.**
- `apps/worker/src/lib/instructions.ts`: drop `getInstructions`/`assembleInstructions`/`PromptConfig`; export `HEADER` + `REPLY_HEADER` only.
- `apps/worker/src/lib/flow/nodes/classify.ts` + `steps/classify.ts`: prompt = `HEADER` + `node.ai_prompt` (remove the `instructions.classifier` fallback).
- `apps/worker/src/lib/flow/steps/draft.ts` (used by `send_reply`) + `generate-reply.ts`: `replyInstructions` = `REPLY_HEADER` + `node.ai_prompt` (remove the `ctx.instructions.reply` fallback).
- `apps/worker/src/processors/email.ts`: remove the `getInstructions` call + `ctx.instructions`.
- `apps/worker/src/lib/flow/types.ts`: remove `StepContext.instructions`.
- **Tricky thread — the chargeback Sonnet check.** `refund-decision.ts` `confirmChargebackThreat` currently uses `instructions.classifier` as its system prompt (passed via `refund_ladder` → `decideRefund({ instructions })`). Decide its new source: simplest is a small hard-coded chargeback-judge prompt in `refund-decision.ts` (it doesn't need the full classifier). Update `refund_ladder` to stop passing `ctx.instructions`.

**Step C — remove the shared layer.**
- Drop the `prompt_configs` table (migration; after Step A copies its content into nodes). Apply to dlwc via MCP.
- Delete the web `/prompts` feature: `app/(overview)/prompts/`, `components/prompts/*`, `lib/prompts.ts`, `lib/prompt-actions.ts`, and the nav link in `components/layout/app-sidebar.tsx`.
- Remove `apps/worker/src/lib/__tests__/instructions.test.ts` (tests `assembleInstructions`, now gone); update `processors/__tests__/email.test.ts` (it mocks `getInstructions` — switch to the header+node-prompt model) and `flow/nodes/__tests__/branching-nodes.test.ts` (the classify-categories test references `ctx.instructions.classifier`).
- `scripts/seed-prompts.mjs` is now dead (it seeded `prompt_configs`); delete or repurpose to seed node prompts.

---

## Verification (gate)
- **Behavior-preserving check:** run the canonical fixtures through the worker (mock adapter) before and after; the drafted reply text + decisions must be unchanged for FAQ / sales / login / refund-ladder scenarios. This is the prime gate — any reply-text drift means a node's migrated prompt is incomplete.
- `pnpm typecheck` (6/6), `pnpm test`, `pnpm lint`, web build — green.
- Spot-check on `/flows`: every reply node shows a complete prompt; editing one changes only that node.

## Risks
- **Reply-quality regression** if a node's baked prompt is missing the guardrails/tone/policy — mitigated by keeping `REPLY_HEADER` hard-coded + the behavior-preserving fixture diff.
- **Degenerate empty prompts:** with no shared fallback, a node with blank `ai_prompt` = just the header. The new-node UX must require/default a prompt.
- **Duplication maintenance** (accepted): shared wording now lives in many nodes.
- Destructive on live data (drop `prompt_configs`) — do it only after Step A has copied the content into nodes; content is also preserved in git (`instructions/` + migration seeds).

## Out of scope / note
- Re-linking the Supabase CLI is done (project `dlwc`); apply migrations via the MCP (the ledger drifts — do not `db push`). See memory `supabase-project-mismatch`.
- The `overview` prompt currently holds the instructions-folder README (a content bug); fix the business-overview content as part of writing the `classify`/reply node prompts.

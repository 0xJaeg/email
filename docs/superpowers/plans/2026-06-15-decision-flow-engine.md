# Decision-Flow Engine (Phase A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the worker's hardcoded `classify → enrich → decide → draft` pipeline with a data-driven, per-inbox sequence of code-defined **steps** read from a new `flow_steps` table, and surface that exact sequence in a read-only **Decision-Flow** admin page — so the agent's logic becomes visible (Ben's #1 ask) without changing its behavior yet.

**Architecture:** Step *types* are defined in code (a small registry of `Step` objects keyed by `step_key`). A `flow_steps` table stores, per inbox (null = global default), which steps run, in what order, with an optional per-step prompt/condition. The worker loads the flow for the email's inbox (falling back to the default), runs the steps in order accumulating a `StepContext`, then persists the decision + audit exactly as today. Increment 1 is a **behavior-preserving refactor** — the existing `pnpm sim:batch` output and `email.test.ts` must stay green — plus a read-only admin view of the seeded flow.

**Tech Stack:** TypeScript (NodeNext), BullMQ worker, Supabase/Postgres (hand-applied SQL migrations + `types.gen.ts`), Next.js 16 App Router admin (the existing "Kaizen" CRUD pattern), Vitest.

**Scope:** This plan = **Phase A, Increment 1** (engine + flow_steps model + behavior-preserving port + read-only flow view). Deferred to later plans: **Increment 2** (make steps editable in the admin + worker reads per-step prompt/condition overrides), **Increment 3** (add the new `spam_filter` and `lookup_gate` steps), and Phases B/C from the master plan (`~/.claude/plans/context-i-m-evaluating-hashed-lollipop.md`).

> **Note for the executor (me):** I have full context on this codebase. For port tasks that move existing logic, the "code" is relocating an identified existing block; the guardrail is that the existing `email.test.ts` + a `sim:batch` smoke run stay green. Novel code (schema, step contracts, executor, admin view) is shown in full below.

---

## File Structure

**New (worker engine):**
- `apps/worker/src/lib/flow/types.ts` — `StepContext`, `FlowStepConfig`, `Step` contracts.
- `apps/worker/src/lib/flow/load-flow.ts` — load `flow_steps` for an inbox (default fallback).
- `apps/worker/src/lib/flow/registry.ts` — `step_key` → `Step` impl map.
- `apps/worker/src/lib/flow/run-flow.ts` — the executor.
- `apps/worker/src/lib/flow/steps/{classify,enrich,decide,draft}.ts` — the ported steps.
- `apps/worker/src/lib/flow/__tests__/run-flow.test.ts` — executor unit tests.

**Modified (worker):**
- `apps/worker/src/processors/email.ts` — slim to: fetch email → `loadFlow(inboxId)` → `runFlow(steps, ctx)` → persist (the executor calls the steps; current inline logic moves into steps).

**New (DB):**
- `packages/db/supabase/migrations/20260615000001_flow_steps.sql` — table + seed default flow.
- `packages/db/supabase/full-setup.sql` — append the same table (consolidated setup).
- `packages/db/src/types.gen.ts` — add `flow_steps` Row/Insert/Update.

**New (admin, read-only view):**
- `apps/web/lib/flow-steps.ts` — `getInboxOptions()`, `getFlowSteps(inboxId | null)`.
- `apps/web/components/flow/flow-view.tsx` — renders steps top-to-bottom per inbox.
- `apps/web/components/flow/inbox-picker.tsx` — URL-driven inbox selector (reuse search-bar pattern).
- `apps/web/app/(overview)/flows/page.tsx` — the Decision-Flow page (admin-gated).
- `apps/web/components/layout/app-sidebar.tsx` — add "Decision flow" under Configuration.

---

## Task 1: `flow_steps` table + seed

**Files:**
- Create: `packages/db/supabase/migrations/20260615000001_flow_steps.sql`
- Modify: `packages/db/supabase/full-setup.sql` (append table), `packages/db/src/types.gen.ts`

- [ ] **Step 1: Write the migration + seed**

```sql
-- Phase A: the per-inbox decision flow. Each row is one code-defined step
-- (step_key matches a Step in the worker registry) for one inbox (null =
-- global default). The worker runs active steps in `position` order.
create table flow_steps (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid references inboxes(id) on delete cascade,  -- null = global default flow
  step_key text not null,                                  -- 'classify' | 'enrich' | 'decide' | 'draft'
  position int not null,
  title text not null,                                     -- admin label
  description text,                                        -- what this step does (admin view)
  ai_prompt text,                                          -- per-step prompt override (Increment 2; nullable now)
  condition jsonb not null default '{}'::jsonb,            -- per-step config (Increment 2)
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index flow_steps_inbox_position_idx on flow_steps (inbox_id, position);

alter table flow_steps enable row level security;
create policy "authenticated read flow_steps" on flow_steps
  for select to authenticated using (true);

-- Seed the global default flow (inbox_id null) = today's pipeline, as steps.
insert into flow_steps (inbox_id, step_key, position, title, description) values
  (null, 'classify', 1, 'Classify the ticket', 'Label the email (refund/FAQ/other) and whether the sender is an existing member or a prospective buyer.'),
  (null, 'enrich',   2, 'Check purchase & access', 'For existing members, look up their order and product access via the product adapter.'),
  (null, 'decide',   3, 'Decide the action', 'Run the refund offer-ladder / FAQ / escalation logic and choose the action + template.'),
  (null, 'draft',    4, 'Draft the reply', 'Write the customer-facing reply (when the decision is a reply/refund) and queue it for human approval.');
```

- [ ] **Step 2: Provide the paste-ready SQL to the user** (they apply it in the Supabase SQL editor) and append the `create table flow_steps (...)` block to `full-setup.sql`.

- [ ] **Step 3: Add `flow_steps` to `types.gen.ts`** (Row/Insert/Update mirroring the columns; `inbox_id: string | null`, `ai_prompt: string | null`, `description: string | null`, `condition: Json`).

- [ ] **Step 4: Commit** — `git commit -m "feat(db): flow_steps table + default-flow seed"`

---

## Task 2: Step contracts + executor (TDD)

**Files:**
- Create: `apps/worker/src/lib/flow/types.ts`, `apps/worker/src/lib/flow/run-flow.ts`
- Test: `apps/worker/src/lib/flow/__tests__/run-flow.test.ts`

- [ ] **Step 1: Define the contracts** (`types.ts`)

```ts
import type { ServerClient } from "@workspace/db/client"
import type Anthropic from "@anthropic-ai/sdk"

export type FlowStepConfig = {
  step_key: string
  position: number
  ai_prompt: string | null
  condition: Record<string, unknown>
}

// Accumulates as steps run. Steps read what earlier steps wrote.
export type StepContext = {
  email: {
    id: string
    thread_id: string | null
    from_email: string
    subject: string
    body_text: string | null
    agent_mail_message_id: string | null
  }
  product: { productId: string; adapterKey: string | null; name: string; supportConfig: unknown } | null
  productFacts?: string
  classification?: { classification: string; inquiry_type: string; reasoning: string }
  enrichment?: { context: unknown; customerContext: string } | null
  decision?: {
    decision: string; template_used: string | null; refund_request_count: number | null
    combinedReasoning: string; llmModel: string; sonnetUsage?: unknown
  }
  draft?: { text: string; usage: unknown }
  // shared services
  supabase: ServerClient
  anthropic: Anthropic
  instructions: { classifier: string; reply: string }
}

export type Step = {
  key: string
  // Returns a patch merged into the context; halt stops the flow early.
  run(ctx: StepContext, config: FlowStepConfig): Promise<Partial<StepContext> & { halt?: boolean }>
}
```

- [ ] **Step 2: Write the failing executor test** (`run-flow.test.ts`)

```ts
import { describe, it, expect, vi } from "vitest"
import { runFlow } from "../run-flow.js"
import type { Step, StepContext, FlowStepConfig } from "../types.js"

const cfg = (k: string, p: number): FlowStepConfig => ({ step_key: k, position: p, ai_prompt: null, condition: {} })

describe("runFlow", () => {
  it("runs steps in position order, threading the accumulated context", async () => {
    const calls: string[] = []
    const a: Step = { key: "a", run: async () => { calls.push("a"); return { productFacts: "x" } } }
    const b: Step = { key: "b", run: async (ctx) => { calls.push("b"); return { draft: { text: ctx.productFacts ?? "", usage: {} } } } }
    const ctx = { } as StepContext
    const out = await runFlow([cfg("b", 2), cfg("a", 1)], { a, b }, ctx)
    expect(calls).toEqual(["a", "b"])
    expect(out.draft?.text).toBe("x")
  })

  it("halts early when a step returns halt", async () => {
    const calls: string[] = []
    const a: Step = { key: "a", run: async () => { calls.push("a"); return { halt: true } } }
    const b: Step = { key: "b", run: async () => { calls.push("b"); return {} } }
    await runFlow([cfg("a", 1), cfg("b", 2)], { a, b }, {} as StepContext)
    expect(calls).toEqual(["a"])
  })

  it("skips unknown step_keys (forward-compatible) and logs them", async () => {
    const a: Step = { key: "a", run: async () => ({}) }
    await expect(runFlow([cfg("ghost", 1), cfg("a", 2)], { a }, {} as StepContext)).resolves.toBeDefined()
  })
})
```

- [ ] **Step 3: Run it — expect FAIL** (`pnpm --filter worker test run-flow` → "runFlow is not a function").

- [ ] **Step 4: Implement `run-flow.ts`**

```ts
import type { Step, StepContext, FlowStepConfig } from "./types.js"

export async function runFlow(
  steps: FlowStepConfig[],
  registry: Record<string, Step>,
  ctx: StepContext
): Promise<StepContext> {
  const ordered = [...steps].sort((a, b) => a.position - b.position)
  for (const cfg of ordered) {
    const step = registry[cfg.step_key]
    if (!step) {
      console.warn(`[flow] unknown step_key '${cfg.step_key}' — skipping`)
      continue
    }
    const patch = await step.run(ctx, cfg)
    Object.assign(ctx, patch)
    if (patch.halt) break
  }
  return ctx
}
```

- [ ] **Step 5: Run tests — expect PASS.** Commit — `git commit -m "feat(worker): flow step contracts + executor"`

---

## Task 3: `load-flow.ts` + registry (TDD)

**Files:** Create `apps/worker/src/lib/flow/load-flow.ts`, `apps/worker/src/lib/flow/registry.ts`; Test `apps/worker/src/lib/flow/__tests__/load-flow.test.ts`

- [ ] **Step 1: Failing test for `loadFlow`** — given an `inbox_id`, returns that inbox's active steps ordered by position; given none, returns the global default (`inbox_id is null`). Mock supabase like `apps/worker/src/processors/__tests__/email.test.ts` does (chainable stub).

- [ ] **Step 2: Implement `load-flow.ts`**

```ts
import type { ServerClient } from "@workspace/db/client"
import type { FlowStepConfig } from "./types.js"

export async function loadFlow(supabase: ServerClient, inboxId: string | null): Promise<FlowStepConfig[]> {
  const select = "step_key, position, ai_prompt, condition"
  if (inboxId) {
    const { data } = await supabase.from("flow_steps").select(select)
      .eq("inbox_id", inboxId).eq("is_active", true).order("position")
    if (data && data.length) return data as FlowStepConfig[]
  }
  const { data } = await supabase.from("flow_steps").select(select)
    .is("inbox_id", null).eq("is_active", true).order("position")
  return (data ?? []) as FlowStepConfig[]
}
```

- [ ] **Step 3:** `registry.ts` exports `STEP_REGISTRY: Record<string, Step>` wiring the four step impls from Task 4. (Create after Task 4's steps exist; for now stub with the keys.)

- [ ] **Step 4:** Run tests — PASS. Commit — `git commit -m "feat(worker): per-inbox flow loader with default fallback"`

---

## Task 4: Port the existing pipeline into steps (behavior-preserving)

Each step wraps logic that currently lives inline in `apps/worker/src/processors/email.ts` / `refund-decision.ts` / `customer-context.ts` / `generate-reply.ts`. Move (don't rewrite) the logic; the steps read/write `StepContext`.

- [ ] **Step 1: `steps/classify.ts`** — move the Haiku classify call (`email.ts` current classify block) into `ClassifyStep.run`; write `ctx.classification`. (`halt` is not used here.)
- [ ] **Step 2: `steps/enrich.ts`** — move the gate (`inquiry_type === "existing_member" && product?.adapterKey`) + `gatherCustomerContext` + the `gather_context` audit; write `ctx.enrichment`.
- [ ] **Step 3: `steps/decide.ts`** — move the `decide()` function (delegates to `decideRefund` in `refund-decision.ts`, unchanged); write `ctx.decision`.
- [ ] **Step 4: `steps/draft.ts`** — move the proposed-actions mapping + `generateReply` call + the decision-row insert + status update + audit (`reply_pending_approval` / `refund_pending_approval` / `escalate_needs_human` / `generate_reply_failed`); write `ctx.draft`. (This is the one step with branches by `ctx.decision.decision`.)
- [ ] **Step 5: `registry.ts`** — wire `{ classify, enrich, decide, draft }`.
- [ ] **Step 6:** Commit per step — `git commit -m "refactor(worker): port <step> into a flow step"`

*Guardrail (no new test needed — reuse existing):* after each port, run `pnpm --filter worker test` — the existing `email.test.ts` assertions (no auto-send, `pending_approval`, `gather_context` audit, proposed_actions, productFacts) must stay green.

---

## Task 5: Rewire `email.ts` to run the flow

**Files:** Modify `apps/worker/src/processors/email.ts`

- [ ] **Step 1:** Replace the inline classify→enrich→decide→draft body with: fetch email (unchanged, incl. `stripQuotedReply`); resolve product (unchanged); look up the thread's `inbox_id`; `const steps = await loadFlow(supabase, inboxId)`; build the initial `StepContext`; `await runFlow(steps, STEP_REGISTRY, ctx)`; return `{ decisionId, classification, decision }` from the context.
- [ ] **Step 2:** Run `pnpm --filter worker test` + `pnpm typecheck` — green.
- [ ] **Step 3: Smoke test** — `pnpm db:start`, `pnpm dev`, `pnpm sim:batch --file scripts/fixtures/demo-ben.json --delay 6000` (a couple tickets); confirm decisions land in `pending_approval`/`needs_human` exactly as before (compare a refund-ladder + FAQ case to current behavior).
- [ ] **Step 4:** Commit — `git commit -m "refactor(worker): drive processEmail via the flow engine"`

---

## Task 6: Read-only Decision-Flow admin page

**Files:** Create `apps/web/lib/flow-steps.ts`, `apps/web/components/flow/{flow-view,inbox-picker}.tsx`, `apps/web/app/(overview)/flows/page.tsx`; Modify `apps/web/components/layout/app-sidebar.tsx`.

- [ ] **Step 1: `lib/flow-steps.ts`** (`server-only`, secret-key client):

```ts
import "server-only"
import { getServerSupabase } from "@/lib/supabase/admin"

export type FlowStepRow = {
  id: string; step_key: string; position: number; title: string
  description: string | null; ai_prompt: string | null; is_active: boolean
}

export async function getInboxOptions() {
  const supabase = getServerSupabase()
  const { data } = await supabase.from("inboxes").select("id, address, agent_mail_inbox_id").order("created_at")
  return data ?? []
}

// inboxId null → the global default flow.
export async function getFlowSteps(inboxId: string | null): Promise<FlowStepRow[]> {
  const supabase = getServerSupabase()
  const sel = "id, step_key, position, title, description, ai_prompt, is_active"
  if (inboxId) {
    const { data } = await supabase.from("flow_steps").select(sel).eq("inbox_id", inboxId).order("position")
    if (data && data.length) return data as FlowStepRow[]
  }
  const { data } = await supabase.from("flow_steps").select(sel).is("inbox_id", null).order("position")
  return (data ?? []) as FlowStepRow[]
}
```

- [ ] **Step 2: `components/flow/flow-view.tsx`** — render the steps as a numbered top-to-bottom flow: each step a card with `position`, `title`, `description`, and a muted `step_key` badge; a downward connector between cards. (shadcn `Card` + tabler icons; match the existing operator-UI style.)
- [ ] **Step 3: `components/flow/inbox-picker.tsx`** — URL-driven `?inbox=` selector (reuse the `components/shared/search-bar.tsx` URL pattern); "Default flow" option = no `?inbox=`.
- [ ] **Step 4: `app/(overview)/flows/page.tsx`** — admin-gated (redirect non-admin, like `/products`); renders `<InboxPicker>` + `<FlowView steps={await getFlowSteps(inboxId)} />`; reads `?inbox=` from `searchParams`. Header copy: "This is the exact sequence the agent runs on a ticket for this inbox."
- [ ] **Step 5:** Add a **Decision flow** item to the sidebar's **Configuration** group (`app-sidebar.tsx`), admin-only, icon `IconSitemap` (or similar).
- [ ] **Step 6:** Verify — `pnpm lint`, `pnpm typecheck`, `pnpm --filter web build`; open `/flows`, confirm the default flow renders and switching inboxes works.
- [ ] **Step 7:** Commit — `git commit -m "feat(web): read-only per-inbox Decision-Flow page"`

---

## Verification (end-to-end, Increment 1)

- `pnpm --filter worker test` + `pnpm test` (whole repo) green — especially the **unchanged** `email.test.ts` (behavior preserved).
- `pnpm typecheck`, `pnpm lint`, `pnpm --filter web build` green.
- `pnpm sim:batch --file scripts/fixtures/demo-ben.json` → decisions land identically to pre-refactor (spot-check a refund-ladder thread + a FAQ + an escalate).
- `/flows` shows the seeded default flow; the steps shown match what the worker actually runs (it reads the same table).
- Human-approval invariant intact: nothing sends/refunds without approval.

---

## Next increments (separate plans)

- **Increment 2 — Tunable:** make `flow-view` steps editable (per-step `ai_prompt` + `condition`), `flow-step-actions.ts` (admin-gated update), and have `classify`/`decide`/`draft` steps read their per-step `ai_prompt`/`condition` from the loaded `FlowStepConfig` (overriding the global `prompt_configs`/`action_triggers` defaults). Per-inbox override rows.
- **Increment 3 — New steps:** `spam_filter` (cheap AI; `halt` on spam → quarantine status) as position 0, and `lookup_gate` (cheap AI deciding whether `enrich` runs) — both editable in the flow page. This is where the new behavior Ben asked for lands.
- **Phases B/C:** multi-platform adapters + credentials wiring + Mav access/auto-add; per-product admin page + auto-inbox-create + template library (see master plan).

---

## Self-review

- **Spec coverage:** Increment 1 implements the master plan's "decision-flow engine foundation (visible)" — engine + per-inbox model + read-only visibility. The *tunable* + *new steps* parts of Phase A are explicitly deferred to Increments 2–3 (flagged, not dropped).
- **Placeholders:** none — schema, contracts, executor, loader, and admin lib are shown in full; port tasks reference exact existing locations with the behavior-preservation test as the gate.
- **Type consistency:** `FlowStepConfig` (worker) and `FlowStepRow` (web) are intentionally distinct (config vs display); `StepContext` fields match what the ported steps read/write; `loadFlow`/`getFlowSteps` share the null-inbox fallback semantics.

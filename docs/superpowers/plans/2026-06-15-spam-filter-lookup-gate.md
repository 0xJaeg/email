# Spam Filter + Lookup Gate (Phase A · Increment 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the two gating steps Ben asked for — a **spam filter** that quarantines junk and stops the flow (no further AI/API calls), and an AI **lookup gate** that decides whether a ticket needs an order/account lookup (so we don't hit platform APIs on every ticket).

**Architecture:** Two new code-defined `Step`s (`spam_filter`, `lookup_gate`) registered in `STEP_REGISTRY`, inserted into the global default flow via `flow_steps` rows. `spam_filter` runs first; on spam it writes a quarantined `decisions` row + audit and returns `{ halt: true }`. `lookup_gate` runs after `classify`; it sets `ctx.needsLookup`, which `EnrichStep` honors (falling back to the existing `inquiry_type` gate when the gate step isn't in the flow). Each new step has a hardcoded default prompt, overridable per-flow via `flow_steps.ai_prompt` (Increment 2).

**Tech Stack:** Vitest (worker); Haiku 4.5 for both cheap gates.

**No schema change:** reuses `flow_steps` (new rows), `decisions.status` (free-text → `"quarantined"`), and a new optional `StepContext.needsLookup` (code only). The only DB write is **data**: 2 new `flow_steps` rows + reposition the existing 4.

**New flow order (global default):** `spam_filter`(1) → `classify`(2) → `lookup_gate`(3) → `enrich`(4) → `decide`(5) → `draft`(6).

---

## File structure

- **Worker**
  - Modify `apps/worker/src/lib/flow/types.ts` — add `needsLookup?: boolean` to `StepContext`.
  - Create `apps/worker/src/lib/flow/steps/spam-filter.ts` (`SpamFilterStep`).
  - Create `apps/worker/src/lib/flow/steps/lookup-gate.ts` (`LookupGateStep`).
  - Modify `apps/worker/src/lib/flow/steps/enrich.ts` — honor `ctx.needsLookup` with fallback.
  - Modify `apps/worker/src/lib/flow/registry.ts` — register both steps.
  - Tests: `__tests__/spam-filter.test.ts`, `__tests__/lookup-gate.test.ts`, extend `__tests__/enrich`-coverage (new `enrich.test.ts`).
- **DB (data, applied via MCP next session or one SQL paste this session)**
  - Create `packages/db/supabase/migrations/20260615000002_flow_spam_lookup.sql` + append to `full-setup.sql`.

---

## Task 1: `StepContext.needsLookup` + `SpamFilterStep` (TDD)

**Files:** Modify `types.ts`; Create `steps/spam-filter.ts`, `steps/__tests__/spam-filter.test.ts`

- [ ] **Step 1: add the flag** — in `types.ts`, after `enrichment?: ...` add:

```ts
  // Set by the lookup_gate step; EnrichStep honors it (falls back to the
  // inquiry_type gate when the gate step isn't in the flow).
  needsLookup?: boolean
```

- [ ] **Step 2: write the failing test** (`spam-filter.test.ts`):

```ts
import { describe, it, expect, vi } from "vitest"
import { SpamFilterStep } from "../spam-filter.js"
import type { StepContext, FlowStepConfig } from "../../types.js"

function makeCtx(isSpam: boolean) {
  const parse = vi.fn().mockResolvedValue({
    parsed_output: { is_spam: isSpam, reasoning: "r" },
    usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  })
  const b: Record<string, unknown> = {}
  b.insert = vi.fn(() => b); b.update = vi.fn(() => b); b.select = vi.fn(() => b); b.eq = vi.fn(() => b)
  b.single = vi.fn(async () => ({ data: { id: "dec-spam" }, error: null }))
  b.then = (r: (v: unknown) => void) => r({ data: null, error: null })
  const audits: Record<string, unknown>[] = []
  const from = (t: string) => {
    if (t === "audit_log") b.insert = vi.fn((p: Record<string, unknown>) => { audits.push(p); return b })
    return b
  }
  const ctx: StepContext = {
    email: { id: "e1", thread_id: null, from_email: "a@b.com", to_email: "s@b.com", subject: "WIN $$$", body_text: "buy now", agent_mail_message_id: null },
    inboxId: null, product: null,
    supabase: { from } as never,
    anthropic: { messages: { parse } } as unknown as StepContext["anthropic"],
    instructions: { classifier: "C", reply: "R" },
  }
  return { ctx, audits }
}
const cfg: FlowStepConfig = { step_key: "spam_filter", position: 1, ai_prompt: null, condition: {} }

describe("SpamFilterStep", () => {
  it("halts + quarantines on spam", async () => {
    const { ctx, audits } = makeCtx(true)
    const patch = await SpamFilterStep.run(ctx, cfg)
    expect(patch.halt).toBe(true)
    expect(audits.some((a) => a.action === "spam_quarantined")).toBe(true)
  })
  it("passes through (no halt) when not spam", async () => {
    const { ctx } = makeCtx(false)
    const patch = await SpamFilterStep.run(ctx, cfg)
    expect(patch.halt).toBeUndefined()
  })
})
```

- [ ] **Step 3: run, verify fail** — `pnpm --filter worker exec vitest run src/lib/flow/steps/__tests__/spam-filter.test.ts` → FAIL (module missing).

- [ ] **Step 4: implement `spam-filter.ts`:**

```ts
import { z } from "zod/v4"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import type { Step } from "../types.js"

const SpamResult = z.object({
  is_spam: z.boolean(),
  reasoning: z.string().describe("1 sentence — why spam or not"),
})

const DEFAULT_PROMPT =
  "You are a spam filter for a product support inbox. Mark is_spam=true ONLY for clear junk: bulk marketing, phishing, automated bounce/out-of-office, or unrelated solicitations. A real customer question (even angry or vague) is NOT spam."

// Step: cheap spam gate. On spam, record a quarantined decision + audit and
// halt the flow (no classify/enrich/decide/draft, no platform API calls).
export const SpamFilterStep: Step = {
  key: "spam_filter",
  async run(ctx, config) {
    const { email, anthropic, supabase, product } = ctx
    const prompt = config.ai_prompt?.trim() ? config.ai_prompt : DEFAULT_PROMPT
    const resp = await anthropic.messages.parse({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      system: [{ type: "text", text: prompt, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: `From: ${email.from_email}\nSubject: ${email.subject}\n\n${email.body_text ?? "(empty body)"}` }],
      output_config: { format: zodOutputFormat(SpamResult) },
    })
    if (!resp.parsed_output?.is_spam) return {}

    const { data: row } = await supabase
      .from("decisions")
      .insert({
        email_id: email.id,
        product_id: product?.productId ?? null,
        classification: "spam",
        decision: "quarantine_spam",
        llm_model: "claude-haiku-4-5",
        llm_reasoning: resp.parsed_output.reasoning,
        status: "quarantined",
        proposed_actions: [],
      })
      .select("id")
      .single()
    await supabase.from("audit_log").insert({
      action: "spam_quarantined",
      email_id: email.id,
      status: "success",
      payload: { decision_id: row?.id, reasoning: resp.parsed_output.reasoning },
    })
    return { halt: true }
  },
}
```

- [ ] **Step 5: run, verify pass** (2 tests). - [ ] **Step 6: commit** `feat(worker): spam_filter step quarantines junk + halts`.

---

## Task 2: `LookupGateStep` (TDD)

**Files:** Create `steps/lookup-gate.ts`, `steps/__tests__/lookup-gate.test.ts`

- [ ] **Step 1: failing test** — asserts `patch.needsLookup` follows the AI's `needs_lookup`:

```ts
import { describe, it, expect, vi } from "vitest"
import { LookupGateStep } from "../lookup-gate.js"
import type { StepContext, FlowStepConfig } from "../../types.js"

function makeCtx(needs: boolean) {
  const parse = vi.fn().mockResolvedValue({
    parsed_output: { needs_lookup: needs, reasoning: "r" },
    usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  })
  const ctx: StepContext = {
    email: { id: "e1", thread_id: null, from_email: "a@b.com", to_email: "s@b.com", subject: "login", body_text: "cant log in", agent_mail_message_id: null },
    inboxId: null, product: null,
    classification: { classification: "faq", inquiry_type: "existing_member", reasoning: "r", usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    supabase: {} as never,
    anthropic: { messages: { parse } } as unknown as StepContext["anthropic"],
    instructions: { classifier: "C", reply: "R" },
  }
  return ctx
}
const cfg: FlowStepConfig = { step_key: "lookup_gate", position: 3, ai_prompt: null, condition: {} }

describe("LookupGateStep", () => {
  it("sets needsLookup=true when the gate says yes", async () => {
    expect((await LookupGateStep.run(makeCtx(true), cfg)).needsLookup).toBe(true)
  })
  it("sets needsLookup=false when the gate says no", async () => {
    expect((await LookupGateStep.run(makeCtx(false), cfg)).needsLookup).toBe(false)
  })
})
```

- [ ] **Step 2: run, verify fail.** - [ ] **Step 3: implement `lookup-gate.ts`** (mirror spam-filter; Haiku + zod `{ needs_lookup: boolean, reasoning }`; `DEFAULT_PROMPT` ≈ "Decide if answering this needs looking up the sender's order/account. Yes for login/access/refund/'where is my product'; No for pre-sale 'how do I buy', general info." returns `{ needsLookup: resp.parsed_output.needs_lookup }`). - [ ] **Step 4: run, verify pass.** - [ ] **Step 5: commit.**

---

## Task 3: `EnrichStep` honors `needsLookup` (TDD)

**Files:** Modify `steps/enrich.ts`; Create `steps/__tests__/enrich.test.ts`

- [ ] **Step 1: failing test** — three cases: `needsLookup=true`+adapter → looks up (calls adapter); `needsLookup=false` → skips even for existing_member; `needsLookup=undefined` → falls back to `inquiry_type==="existing_member"`.
- [ ] **Step 2: run, verify fail** (the `needsLookup=false`-skips case fails today — enrich only checks inquiry_type).
- [ ] **Step 3: implement** — replace the gate condition:

```ts
    const { classification, product, email, supabase } = ctx
    const wantLookup =
      ctx.needsLookup !== undefined
        ? ctx.needsLookup
        : classification?.inquiry_type === "existing_member"
    if (!wantLookup || !product?.adapterKey) {
      return { enrichment: null }
    }
```

- [ ] **Step 4: run, verify pass.** - [ ] **Step 5: commit.**

---

## Task 4: Register steps + flow rows migration

**Files:** Modify `registry.ts`; Create `packages/db/supabase/migrations/20260615000002_flow_spam_lookup.sql`; append to `full-setup.sql`

- [ ] Add `SpamFilterStep` + `LookupGateStep` imports + entries to `STEP_REGISTRY`.
- [ ] Write the migration (reposition existing 4 + insert 2):

```sql
update flow_steps set position = 2 where inbox_id is null and step_key = 'classify';
update flow_steps set position = 4 where inbox_id is null and step_key = 'enrich';
update flow_steps set position = 5 where inbox_id is null and step_key = 'decide';
update flow_steps set position = 6 where inbox_id is null and step_key = 'draft';
insert into flow_steps (inbox_id, step_key, position, title, description) values
  (null, 'spam_filter', 1, 'Spam filter', 'Cheap AI check — if spam/junk/auto-reply, quarantine and stop (no further processing or API calls).'),
  (null, 'lookup_gate', 3, 'Order-lookup gate', 'Cheap AI decides whether this ticket needs an order/account lookup, so we do not hit platform APIs on every ticket.');
```

- [ ] Apply via Supabase MCP (`apply_migration`) if available, else hand the user the SQL once.
- [ ] `pnpm --filter worker typecheck`. - [ ] Commit.

---

## Task 5: Verify + finish

- [ ] `pnpm test` + `pnpm typecheck` + `pnpm lint` + `pnpm --filter web build` all green.
- [ ] **Adversarial self-review:** dispatch a code-review subagent over the diff (no human reviewer in the loop).
- [ ] Optional live smoke once the rows are applied: a spam email halts (quarantined, no draft); a "how do I buy?" skips lookup; a login issue does the lookup.
- [ ] superpowers:finishing-a-development-branch → push + PR + merge (non-money phase → auto-merge per policy).

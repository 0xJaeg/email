# Flow Step Editing (Phase A · Increment 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make each prompt-driven step's AI prompt editable in the admin and applied by the worker on the next ticket — turning the read-only `/flows` page (Increment 1) into a *tunable* one (Ben's #1 ask: see **and tune** the flow).

**Architecture:** `flow_steps.ai_prompt` becomes a per-flow **override** of a step's prompt. The two prompt-driven steps (`classify`, `draft`) use `config.ai_prompt` when set, else fall back to the global `prompt_configs` instructions (already editable at `/prompts`). The admin edits a step's prompt via a Sheet (mirroring the `/prompts` editor), gated to admins, hot-reloaded by the worker within its cache TTL (no restart). Empty prompt = fall back to global.

**Tech Stack:** Next.js 16 server actions + shadcn Sheet (web); Vitest (worker).

**Scope decisions (stated, reversible):**
- **IN:** editable `ai_prompt` for `classify` + `draft` (the only prompt-driven steps); worker applies the override with fallback to global; admin Sheet editor; admin-gated server action with independent re-check.
- **DEFERRED (not this increment):** editing `enrich`/`decide` prompts (they run fixed logic — adapter lookup / refund rule-tree, no free-form prompt); `condition`/threshold editing (belongs with the gate steps in Increment 3); per-inbox flow **cloning** (only the global default flow exists today — single product/inbox; revisit when a 2nd inbox lands in Phase B/C).

---

## File structure

- **Worker**
  - Modify `apps/worker/src/lib/flow/steps/classify.ts` — use `config.ai_prompt` for the classifier system block when set.
  - Modify `apps/worker/src/lib/flow/steps/draft.ts` — thread `config.ai_prompt` into `draftAndQueue` as the reply-instructions override.
  - Create `apps/worker/src/lib/flow/steps/__tests__/classify.test.ts`
  - Create `apps/worker/src/lib/flow/steps/__tests__/draft.test.ts`
- **Web**
  - Create `apps/web/lib/flow-actions.ts` — `updateFlowStepPrompt(formData)`, admin-gated, `revalidatePath("/flows")`.
  - Create `apps/web/components/flow/step-prompt-form.tsx` — client Sheet form (mirror `prompt-form.tsx`).
  - Create `apps/web/components/flow/edit-step-button.tsx` — client Sheet trigger (mirror `edit-prompt-button.tsx`).
  - Modify `apps/web/lib/flow-steps.ts` — export `PROMPT_DRIVEN_STEPS` (the step_keys with an editable prompt); `FlowStepRow` already carries `ai_prompt`/`id`.
  - Modify `apps/web/components/flow/flow-view.tsx` — render `EditStepButton` on prompt-driven steps + a scope note.

---

## Task 1: Worker — `classify` applies the `ai_prompt` override (TDD)

**Files:** Modify `apps/worker/src/lib/flow/steps/classify.ts`; Create `apps/worker/src/lib/flow/steps/__tests__/classify.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest"
import { ClassifyStep } from "../classify.js"
import type { StepContext, FlowStepConfig } from "../../types.js"

function makeCtx(): StepContext {
  const parse = vi.fn().mockResolvedValue({
    parsed_output: { classification: "faq", inquiry_type: "prospective_buyer", reasoning: "r" },
    usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  })
  return {
    email: { id: "e1", thread_id: null, from_email: "a@b.com", to_email: "s@b.com", subject: "hi", body_text: "hello", agent_mail_message_id: null },
    inboxId: null, product: null,
    supabase: {} as never,
    anthropic: { messages: { parse } } as never,
    instructions: { classifier: "GLOBAL_CLASSIFIER", reply: "GLOBAL_REPLY" },
  }
}
const cfg = (ai_prompt: string | null): FlowStepConfig => ({ step_key: "classify", position: 1, ai_prompt, condition: {} })

describe("ClassifyStep ai_prompt override", () => {
  it("uses config.ai_prompt as the system prompt when set", async () => {
    const ctx = makeCtx()
    await ClassifyStep.run(ctx, cfg("CUSTOM_CLASSIFIER"))
    const parse = (ctx.anthropic.messages as { parse: ReturnType<typeof vi.fn> }).parse
    expect(parse.mock.calls[0]?.[0].system[0].text).toBe("CUSTOM_CLASSIFIER")
  })

  it("falls back to instructions.classifier when ai_prompt is null/blank", async () => {
    const ctx = makeCtx()
    await ClassifyStep.run(ctx, cfg(null))
    const parse = (ctx.anthropic.messages as { parse: ReturnType<typeof vi.fn> }).parse
    expect(parse.mock.calls[0]?.[0].system[0].text).toBe("GLOBAL_CLASSIFIER")
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter worker exec vitest run src/lib/flow/steps/__tests__/classify.test.ts`
Expected: FAIL on the override case (currently always uses `instructions.classifier`).

- [ ] **Step 3: Implement**

In `classify.ts`, change `run(ctx)` → `run(ctx, config)` and compute the prompt:

```ts
  async run(ctx, config) {
    const { email, anthropic, instructions } = ctx
    const classifierPrompt =
      config.ai_prompt && config.ai_prompt.trim()
        ? config.ai_prompt
        : instructions.classifier
```
…and use `text: classifierPrompt` in the system block (keep `cache_control`).

- [ ] **Step 4: Run, verify pass.** Run: same command. Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/lib/flow/steps/classify.ts apps/worker/src/lib/flow/steps/__tests__/classify.test.ts
git commit -m "feat(worker): classify step honors per-step ai_prompt override"
```

---

## Task 2: Worker — `draft` applies the `ai_prompt` override (TDD)

**Files:** Modify `apps/worker/src/lib/flow/steps/draft.ts`; Create `apps/worker/src/lib/flow/steps/__tests__/draft.test.ts`

- [ ] **Step 1: Write the failing test** (faq → isReply branch; assert `generateReply` got the override)

```ts
import { describe, it, expect, vi } from "vitest"

const generateReply = vi.fn().mockResolvedValue({
  text: "drafted", usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
})
vi.mock("../../../generate-reply.js", () => ({ generateReply: (...a: unknown[]) => generateReply(...a) }))

import { DraftStep } from "../draft.js"
import type { StepContext, FlowStepConfig } from "../../types.js"

function makeCtx(): StepContext {
  const b: Record<string, unknown> = {}
  b.insert = vi.fn(() => b); b.update = vi.fn(() => b); b.select = vi.fn(() => b); b.eq = vi.fn(() => b)
  b.single = vi.fn(async () => ({ data: { id: "dec-1" }, error: null }))
  b.then = (r: (v: unknown) => void) => r({ data: null, error: null })
  return {
    email: { id: "e1", thread_id: null, from_email: "a@b.com", to_email: "s@b.com", subject: "hi", body_text: "x", agent_mail_message_id: null },
    inboxId: null, product: null,
    classification: { classification: "faq", inquiry_type: "prospective_buyer", reasoning: "r", usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    enrichment: null,
    decision: { decision: "send_faq_reply", template_used: null, refund_request_count: null, combinedReasoning: "r", llmModel: "claude-haiku-4-5" },
    supabase: { from: () => b } as never,
    anthropic: {} as never,
    instructions: { classifier: "GLOBAL_CLASSIFIER", reply: "GLOBAL_REPLY" },
  }
}
const cfg = (ai_prompt: string | null): FlowStepConfig => ({ step_key: "draft", position: 4, ai_prompt, condition: {} })

describe("DraftStep ai_prompt override", () => {
  it("passes config.ai_prompt as replyInstructions when set", async () => {
    generateReply.mockClear()
    await DraftStep.run(makeCtx(), cfg("CUSTOM_REPLY"))
    expect(generateReply.mock.calls[0]?.[0].replyInstructions).toBe("CUSTOM_REPLY")
  })
  it("falls back to instructions.reply when ai_prompt is null/blank", async () => {
    generateReply.mockClear()
    await DraftStep.run(makeCtx(), cfg(null))
    expect(generateReply.mock.calls[0]?.[0].replyInstructions).toBe("GLOBAL_REPLY")
  })
})
```

- [ ] **Step 2: Run it, verify it fails.** Run: `pnpm --filter worker exec vitest run src/lib/flow/steps/__tests__/draft.test.ts` — FAIL (draftAndQueue currently always uses `instructions.reply`).

- [ ] **Step 3: Implement** — `run(ctx, config)`, compute `replyInstructions = config.ai_prompt?.trim() ? config.ai_prompt : ctx.instructions.reply`, pass it to `draftAndQueue(ctx, row.id, template, auditAction, replyInstructions)`; change `draftAndQueue` to accept `replyInstructions: string` and use it instead of `instructions.reply`.

- [ ] **Step 4: Run, verify pass** (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/lib/flow/steps/draft.ts apps/worker/src/lib/flow/steps/__tests__/draft.test.ts
git commit -m "feat(worker): draft step honors per-step ai_prompt override"
```

---

## Task 3: Web — `updateFlowStepPrompt` server action (admin-gated)

**Files:** Create `apps/web/lib/flow-actions.ts`

Mirror `prompt-actions.ts`: `"use server"`, a `requireAdmin()` copy, then:

```ts
export async function updateFlowStepPrompt(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const id = String(formData.get("id") ?? "")
  const raw = String(formData.get("ai_prompt") ?? "")
  if (!id) return { error: true, message: "Missing step id." }
  const ai_prompt = raw.trim() ? raw : null // empty = fall back to the global prompt
  const { error } = await auth.admin
    .from("flow_steps")
    .update({ ai_prompt, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: true, message: error.message }
  revalidatePath("/flows")
  return { error: false, message: "Step updated." }
}
```

- [ ] Write it. - [ ] `pnpm --filter web typecheck`. - [ ] Commit.

---

## Task 4: Web — edit Sheet + wire into `/flows`

**Files:** Create `components/flow/step-prompt-form.tsx`, `components/flow/edit-step-button.tsx`; Modify `lib/flow-steps.ts`, `components/flow/flow-view.tsx`

- [ ] `lib/flow-steps.ts`: add `export const PROMPT_DRIVEN_STEPS = ["classify", "draft"] as const` (steps whose `ai_prompt` the worker consumes).
- [ ] `step-prompt-form.tsx`: mirror `prompt-form.tsx` — hidden `id`, `Textarea name="ai_prompt" defaultValue={step.ai_prompt ?? ""}` (NOT required — empty = fall back), placeholder noting fallback; calls `updateFlowStepPrompt`; toast + close.
- [ ] `edit-step-button.tsx`: mirror `edit-prompt-button.tsx` — `IconPencil` trigger, Sheet, title `Edit: {step.title}`, description `{step.step_key}`, renders `StepPromptForm`.
- [ ] `flow-view.tsx`: for steps where `PROMPT_DRIVEN_STEPS.includes(step.step_key)`, render `<EditStepButton step={step} />` in the header row; add a one-line scope note (global default vs inbox). Keep read-only display for the rest.
- [ ] `pnpm --filter web build`. - [ ] Commit.

---

## Task 5: Verify + finish

- [ ] `pnpm test` (all green, incl. the 4 new), `pnpm typecheck`, `pnpm lint`, `pnpm --filter web build`.
- [ ] Manual smoke (optional, app running): edit the `classify` step's prompt at `/flows` → `pnpm sim:batch` → confirm the worker used the override (boot/behavior); blank it → falls back.
- [ ] superpowers:finishing-a-development-branch.

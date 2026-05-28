# Slice E — Action Layer & Refund Approval Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the action layer (`sendReply` via Agent Mail + `refundCustomer` ClickBank stub) and the dashboard refund-approval queue. Worker auto-fires replies for FAQ / Offer 1 / Offer 2 decisions; refund decisions land in `pending_approval` and only fire after a human clicks Approve in `/approvals`. Reconcile the `instructions/` system-prompt store to match the approval semantics; re-verify slices C and D after.

**Architecture:** Worker classifies → decides → either auto-sends (non-refund) or pre-generates a draft + waits (refund). Pending refunds surface in a new dashboard route at `/approvals`; server actions call shared functions in a new `packages/actions` package on approve/reject. ClickBank refund is a stub; signature stays unchanged for the real-API swap later. Refund decisions never auto-execute (project memory: `refunds-require-manual-approval`).

**Tech Stack:** TypeScript (NodeNext for backend, Bundler for Next.js), Vitest for unit tests, AgentMail SDK (`agentmail` npm package), Supabase Postgres + Realtime, BullMQ on Redis, Hono on the API, Next.js 16 App Router on web, shadcn/ui.

**Reference spec:** `docs/superpowers/specs/2026-05-28-slice-e-action-layer-design.md` (commit `94feef2`).

---

## File structure

**Created:**
- `vitest.config.ts` — root Vitest config.
- `packages/actions/package.json`, `tsconfig.json`, `src/index.ts` — new workspace package.
- `packages/actions/src/types.ts` — shared arg / result types.
- `packages/actions/src/agent-mail.ts` — lazy `AgentMailClient` singleton.
- `packages/actions/src/sendReply.ts` — outbound reply + audit log.
- `packages/actions/src/refundCustomer.ts` — ClickBank stub + audit log.
- `packages/actions/src/__tests__/sendReply.test.ts`, `refundCustomer.test.ts` — unit tests with mock clients.
- `packages/db/supabase/migrations/<timestamp>_decisions_approval_state.sql` — adds 4 columns.
- `apps/worker/src/lib/generate-reply.ts` — Haiku reply gen with cached instructions.
- `apps/worker/src/lib/__tests__/generate-reply.test.ts` — unit test for prompt shape.
- `apps/web/app/(overview)/approvals/page.tsx` — SSR list of pending refunds.
- `apps/web/components/approvals-table.tsx` — client component, Approve/Reject buttons.
- `apps/web/lib/approvals.ts` — server actions `approveRefund` + `rejectRefund`.
- `apps/web/lib/decisions.ts` — query helper `fetchPendingApprovals`.

**Modified:**
- `package.json` (root) — add `vitest` dev dep + `test` script.
- `apps/worker/package.json` — add `@workspace/actions` dep; `test` script.
- `apps/web/package.json` — add `@workspace/actions` dep; `test` script.
- `packages/db/src/database.types.ts` (regenerated) — picks up new columns.
- `apps/worker/src/processors/email.ts` — branch into auto-send vs queue refund.
- `apps/web/components/nav-main.tsx` — sidebar entry for `/approvals`.
- `apps/web/components/status-badges.tsx` — new status values for the badge.
- `instructions/policies/refund.md`, `tone/voice.md`, `policies/common-questions.md` — reword to approval semantics.
- `docs/initial-plan.md` Current status — mark slice E shipped (final task).

---

## Task 1: Add Vitest as the workspace test runner

**Files:**
- Create: `vitest.config.ts` (root)
- Modify: `package.json` (root)

- [ ] **Step 1.1: Install Vitest at root**

```bash
pnpm add -wD vitest
```

Expected: `vitest` lands in root `devDependencies`; pnpm-lock updates.

- [ ] **Step 1.2: Create root vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
  },
})
```

- [ ] **Step 1.3: Add root + workspace test scripts**

In `package.json` (root), under `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

In `apps/worker/package.json`, under `"scripts"`, add:

```json
"test": "vitest run"
```

(`packages/actions/package.json`'s test script is set up when that package is scaffolded in Task 3.)

- [ ] **Step 1.4: Smoke test — create + run + delete**

Create `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest"

describe("smoke", () => {
  it("vitest works", () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run `pnpm test` — expect 1 passed.

Then `rm tests/smoke.test.ts`.

- [ ] **Step 1.5: Commit**

```bash
git add vitest.config.ts package.json pnpm-lock.yaml
git commit -m "Add Vitest as the workspace test runner"
```

---

## Task 2: Schema migration — approval state on `decisions`

**Files:**
- Create: `packages/db/supabase/migrations/<timestamp>_decisions_approval_state.sql`
- Modify: `packages/db/src/database.types.ts` (regenerated)

- [ ] **Step 2.1: Generate migration filename**

```bash
ls packages/db/supabase/migrations/
```

Pick a new timestamped name in the existing format, e.g. `20260528000001_decisions_approval_state.sql` (use the current date/time).

- [ ] **Step 2.2: Write the migration**

Create the new file with:

```sql
alter table decisions
  add column status text not null default 'pending_action',
  add column draft_reply_text text,
  add column approved_at timestamptz,
  add column approved_by text;

create index decisions_status_idx on decisions (status);

-- Existing rows: treat any existing decision as 'sent' (they predate the action layer
-- and shouldn't show up in the approval queue).
update decisions set status = 'sent' where status = 'pending_action';
```

- [ ] **Step 2.3: Apply migration**

```bash
supabase db push
```

Expected: migration applies; new columns visible. Verify:

```bash
supabase db remote commit  # (no-op verify)
psql "$(supabase status -o json | jq -r .DB_URL)" -c "\d decisions"  # OR via Supabase Studio
```

Or simpler — query the table:

```bash
set -a; . .env.local; set +a
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/decisions?select=id,status,draft_reply_text,approved_at,approved_by&limit=1" | jq
```

Expected: rows return with the new keys.

- [ ] **Step 2.4: Regenerate types**

```bash
pnpm --filter @workspace/db gen-types
```

Expected: `packages/db/src/database.types.ts` includes new columns on `decisions`.

- [ ] **Step 2.5: Commit**

```bash
git add packages/db/supabase/migrations/ packages/db/src/database.types.ts
git commit -m "Add approval state columns to decisions"
```

---

## Task 3: `packages/actions` package skeleton

**Files:**
- Create: `packages/actions/package.json`, `tsconfig.json`, `src/index.ts`, `src/types.ts`
- Modify: `apps/worker/package.json`, `apps/web/package.json`

- [ ] **Step 3.1: Scaffold the package**

Create `packages/actions/package.json`:

```json
{
  "name": "@workspace/actions",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@workspace/db": "workspace:*",
    "agentmail": "^0.1.0"
  },
  "devDependencies": {
    "@types/node": "^25.1.0",
    "@workspace/eslint-config": "workspace:*",
    "@workspace/typescript-config": "workspace:*",
    "typescript": "^5.9.3"
  }
}
```

Note: pin `agentmail` to whatever the latest stable is at install time (the version above is a placeholder — `pnpm add` will resolve).

Create `packages/actions/tsconfig.json`:

```json
{
  "extends": "@workspace/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

Create `packages/actions/src/index.ts`:

```ts
export { sendReply } from "./sendReply.js"
export { refundCustomer } from "./refundCustomer.js"
export type {
  SendReplyArgs,
  SendReplyResult,
  RefundCustomerArgs,
  RefundCustomerResult,
} from "./types.js"
```

Create `packages/actions/src/types.ts`:

```ts
import type { ServerClient } from "@workspace/db/client"

export type SendReplyArgs = {
  /** Agent Mail inbox id (from env). */
  inboxId: string
  /** Agent Mail message id of the inbound email being replied to. */
  inReplyToMessageId: string
  /** Plain-text reply body. */
  replyText: string
  /** Internal decision id, for audit linkage. */
  decisionId: string
  supabase: ServerClient
}

export type SendReplyResult =
  | { ok: true; sentMessageId: string }
  | { ok: false; error: string }

export type RefundCustomerArgs = {
  decisionId: string
  customerEmail: string
  /** Best-effort extraction from email body. Stub doesn't validate; real ClickBank will. */
  orderId: string | null
  /** Optional. Stub doesn't enforce. */
  amount: number | null
  supabase: ServerClient
}

export type RefundCustomerResult =
  | { ok: true; refundId: string }
  | { ok: false; error: string }
```

- [ ] **Step 3.2: Install the agentmail SDK in the new package**

```bash
pnpm --filter @workspace/actions add agentmail
```

Expected: `agentmail` lands in `packages/actions/package.json` dependencies with the resolved real version.

- [ ] **Step 3.3: Add as dep to worker and web**

```bash
pnpm --filter worker add @workspace/actions@workspace:*
pnpm --filter web add @workspace/actions@workspace:*
```

- [ ] **Step 3.4: Verify the package typechecks (empty placeholder for now)**

Since `sendReply.ts` and `refundCustomer.ts` don't exist yet, temporarily stub `index.ts` to:

```ts
export const __placeholder = true
```

Run `pnpm --filter @workspace/actions typecheck` — expect exit 0.

Revert `index.ts` to the real exports above (it'll typecheck after Task 4 / Task 5).

- [ ] **Step 3.5: Commit**

```bash
git add packages/actions/ apps/worker/package.json apps/web/package.json pnpm-lock.yaml
git commit -m "Scaffold @workspace/actions package with shared types"
```

---

## Task 4: `refundCustomer` stub + unit test

**Files:**
- Create: `packages/actions/src/refundCustomer.ts`, `packages/actions/src/__tests__/refundCustomer.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `packages/actions/src/__tests__/refundCustomer.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import { refundCustomer } from "../refundCustomer.js"
import type { ServerClient } from "@workspace/db/client"

function mockSupabase() {
  const auditInsert = vi.fn().mockResolvedValue({ data: null, error: null })
  const supabase = {
    from: vi.fn((table: string) => ({
      insert: auditInsert,
    })),
  } as unknown as ServerClient
  return { supabase, auditInsert }
}

describe("refundCustomer (stub)", () => {
  it("returns ok with a stub-<uuid> refund id", async () => {
    const { supabase } = mockSupabase()
    const result = await refundCustomer({
      decisionId: "decision-1",
      customerEmail: "alice@example.com",
      orderId: "ord_123",
      amount: 97,
      supabase,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.refundId).toMatch(/^stub-[0-9a-f-]+$/)
    }
  })

  it("writes an audit_log row capturing the intended refund", async () => {
    const { supabase, auditInsert } = mockSupabase()
    await refundCustomer({
      decisionId: "decision-1",
      customerEmail: "alice@example.com",
      orderId: "ord_123",
      amount: 97,
      supabase,
    })
    expect(supabase.from).toHaveBeenCalledWith("audit_log")
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "refund_customer_stub",
        status: "success",
        payload: expect.objectContaining({
          decision_id: "decision-1",
          customer_email: "alice@example.com",
          order_id: "ord_123",
          amount: 97,
          stub: true,
        }),
      })
    )
  })
})
```

- [ ] **Step 4.2: Run test → expect FAIL**

```bash
pnpm --filter @workspace/actions test
```

Expected: FAIL with "Cannot find module '../refundCustomer'".

- [ ] **Step 4.3: Implement the stub**

Create `packages/actions/src/refundCustomer.ts`:

```ts
import { randomUUID } from "node:crypto"
import type { RefundCustomerArgs, RefundCustomerResult } from "./types.js"

export async function refundCustomer(
  args: RefundCustomerArgs
): Promise<RefundCustomerResult> {
  const refundId = `stub-${randomUUID()}`
  await args.supabase.from("audit_log").insert({
    action: "refund_customer_stub",
    status: "success",
    payload: {
      decision_id: args.decisionId,
      customer_email: args.customerEmail,
      order_id: args.orderId,
      amount: args.amount,
      refund_id: refundId,
      stub: true,
    },
  })
  return { ok: true, refundId }
}
```

- [ ] **Step 4.4: Run test → expect PASS**

```bash
pnpm --filter @workspace/actions test
```

Expected: 2 passed.

- [ ] **Step 4.5: Commit**

```bash
git add packages/actions/src/refundCustomer.ts packages/actions/src/__tests__/refundCustomer.test.ts
git commit -m "Add refundCustomer ClickBank stub with audit log"
```

---

## Task 5: AgentMail client singleton + `sendReply` + unit test

**Files:**
- Create: `packages/actions/src/agent-mail.ts`, `packages/actions/src/sendReply.ts`, `packages/actions/src/__tests__/sendReply.test.ts`
- Required env vars (added to `.env.local`): `AGENT_MAIL_API_KEY`, `AGENT_MAIL_INBOX_ID`

- [ ] **Step 5.1: Add env vars to .env.local**

In `.env.local` (the user's local file — needs the real key from the AgentMail dashboard):

```env
AGENT_MAIL_API_KEY=<from AgentMail dashboard>
AGENT_MAIL_INBOX_ID=<the inbox id receiving webhooks>
```

If the implementer doesn't have access, halt and ask the user to populate these before proceeding.

- [ ] **Step 5.2: Create the AgentMail client singleton**

Create `packages/actions/src/agent-mail.ts`:

```ts
import { AgentMailClient } from "agentmail"

let cached: AgentMailClient | null = null

export function getAgentMailClient(): AgentMailClient {
  if (cached) return cached
  const apiKey = process.env.AGENT_MAIL_API_KEY
  if (!apiKey) {
    throw new Error("AGENT_MAIL_API_KEY is not set")
  }
  cached = new AgentMailClient({ apiKey })
  return cached
}

export function getAgentMailInboxId(): string {
  const inboxId = process.env.AGENT_MAIL_INBOX_ID
  if (!inboxId) {
    throw new Error("AGENT_MAIL_INBOX_ID is not set")
  }
  return inboxId
}
```

- [ ] **Step 5.3: Write the failing test**

Create `packages/actions/src/__tests__/sendReply.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { sendReply } from "../sendReply.js"
import type { ServerClient } from "@workspace/db/client"

function mockSupabase() {
  const auditInsert = vi.fn().mockResolvedValue({ data: null, error: null })
  const supabase = {
    from: vi.fn(() => ({ insert: auditInsert })),
  } as unknown as ServerClient
  return { supabase, auditInsert }
}

const mockReply = vi.fn()
vi.mock("../agent-mail.js", () => ({
  getAgentMailClient: () => ({
    inboxes: {
      messages: {
        reply: (...args: unknown[]) => mockReply(...args),
      },
    },
  }),
  getAgentMailInboxId: () => "inbox_test",
}))

describe("sendReply", () => {
  beforeEach(() => mockReply.mockReset())

  it("calls AgentMail reply with inboxId + inReplyToMessageId + text, returns sentMessageId", async () => {
    mockReply.mockResolvedValue({ id: "msg_sent_42" })
    const { supabase } = mockSupabase()
    const result = await sendReply({
      inboxId: "inbox_test",
      inReplyToMessageId: "msg_in_99",
      replyText: "Hi — refund issued, you'll see $97 back within 3–5 days.",
      decisionId: "decision-1",
      supabase,
    })
    expect(mockReply).toHaveBeenCalledWith(
      "inbox_test",
      "msg_in_99",
      expect.objectContaining({ text: expect.any(String) })
    )
    expect(result).toEqual({ ok: true, sentMessageId: "msg_sent_42" })
  })

  it("audits success", async () => {
    mockReply.mockResolvedValue({ id: "msg_sent_42" })
    const { supabase, auditInsert } = mockSupabase()
    await sendReply({
      inboxId: "inbox_test",
      inReplyToMessageId: "msg_in_99",
      replyText: "ok",
      decisionId: "decision-1",
      supabase,
    })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "send_reply",
        status: "success",
        payload: expect.objectContaining({
          decision_id: "decision-1",
          sent_message_id: "msg_sent_42",
          in_reply_to: "msg_in_99",
        }),
      })
    )
  })

  it("returns ok:false and audits failure when AgentMail throws", async () => {
    mockReply.mockRejectedValue(new Error("rate limited"))
    const { supabase, auditInsert } = mockSupabase()
    const result = await sendReply({
      inboxId: "inbox_test",
      inReplyToMessageId: "msg_in_99",
      replyText: "ok",
      decisionId: "decision-1",
      supabase,
    })
    expect(result).toEqual({ ok: false, error: "rate limited" })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "send_reply",
        status: "failure",
        error: "rate limited",
      })
    )
  })
})
```

- [ ] **Step 5.4: Run test → expect FAIL**

```bash
pnpm --filter @workspace/actions test
```

Expected: FAIL on "Cannot find module '../sendReply'".

- [ ] **Step 5.5: Implement `sendReply`**

Create `packages/actions/src/sendReply.ts`:

```ts
import { getAgentMailClient } from "./agent-mail.js"
import type { SendReplyArgs, SendReplyResult } from "./types.js"

export async function sendReply(args: SendReplyArgs): Promise<SendReplyResult> {
  const client = getAgentMailClient()
  try {
    const sent = await client.inboxes.messages.reply(
      args.inboxId,
      args.inReplyToMessageId,
      { text: args.replyText }
    )
    await args.supabase.from("audit_log").insert({
      action: "send_reply",
      status: "success",
      payload: {
        decision_id: args.decisionId,
        in_reply_to: args.inReplyToMessageId,
        sent_message_id: sent.id,
      },
    })
    return { ok: true, sentMessageId: sent.id }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await args.supabase.from("audit_log").insert({
      action: "send_reply",
      status: "failure",
      error,
      payload: {
        decision_id: args.decisionId,
        in_reply_to: args.inReplyToMessageId,
      },
    })
    return { ok: false, error }
  }
}
```

- [ ] **Step 5.6: Run test → expect PASS**

```bash
pnpm --filter @workspace/actions test
```

Expected: 3 passed (refundCustomer's 2 + sendReply's 3 = 5 total).

- [ ] **Step 5.7: Typecheck the package**

```bash
pnpm --filter @workspace/actions typecheck
```

Expected: exit 0.

- [ ] **Step 5.8: Commit**

```bash
git add packages/actions/src/agent-mail.ts packages/actions/src/sendReply.ts packages/actions/src/__tests__/sendReply.test.ts
git commit -m "Add sendReply via Agent Mail with audit logging"
```

---

## Task 6: `generateReply` worker helper + unit test

**Files:**
- Create: `apps/worker/src/lib/generate-reply.ts`, `apps/worker/src/lib/__tests__/generate-reply.test.ts`

- [ ] **Step 6.1: Write the failing test**

Create `apps/worker/src/lib/__tests__/generate-reply.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import { generateReply } from "../generate-reply.js"
import type Anthropic from "@anthropic-ai/sdk"

function mockAnthropic(replyText: string) {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: replyText }],
    usage: {
      input_tokens: 50,
      output_tokens: 30,
      cache_read_input_tokens: 4844,
      cache_creation_input_tokens: 0,
    },
  })
  return { messages: { create } } as unknown as Anthropic
}

describe("generateReply", () => {
  it("calls Haiku with cached instructions + per-email user prompt; returns text + usage", async () => {
    const anthropic = mockAnthropic("Hi Alice — refund issued. — Sam")
    const result = await generateReply({
      template: "REFUND_CONFIRMATION",
      email: {
        from_email: "Alice <alice@x.com>",
        subject: "refund pls",
        body_text: "Please refund.",
      },
      anthropic,
    })
    expect(result.text).toBe("Hi Alice — refund issued. — Sam")
    expect(result.usage.cache_read_input_tokens).toBe(4844)
    const callArgs = (anthropic.messages.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0]
    expect(callArgs.model).toBe("claude-haiku-4-5")
    expect(callArgs.system[0].cache_control).toEqual({
      type: "ephemeral",
      ttl: "1h",
    })
    expect(callArgs.messages[0].content).toContain("REFUND_CONFIRMATION")
    expect(callArgs.messages[0].content).toContain("alice@x.com")
  })

  it("throws on empty text response", async () => {
    const anthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [], usage: {} }),
      },
    } as unknown as Anthropic
    await expect(
      generateReply({
        template: "FAQ_REPLY",
        email: { from_email: "x@x.com", subject: "s", body_text: "b" },
        anthropic,
      })
    ).rejects.toThrow(/empty/)
  })
})
```

- [ ] **Step 6.2: Run test → expect FAIL**

```bash
pnpm --filter worker test
```

Expected: FAIL on "Cannot find module '../generate-reply'".

- [ ] **Step 6.3: Implement `generateReply`**

Create `apps/worker/src/lib/generate-reply.ts`:

```ts
import type Anthropic from "@anthropic-ai/sdk"
import { INSTRUCTIONS_TEXT } from "./instructions.js"

export type Template =
  | "FAQ_REPLY"
  | "OFFER_1"
  | "OFFER_2"
  | "REFUND_CONFIRMATION"
  | "REFUND_CHARGEBACK_APOLOGY"

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number | null
  cache_creation_input_tokens: number | null
}

export type GenerateReplyArgs = {
  template: Template
  email: { from_email: string; subject: string; body_text: string | null }
  anthropic: Anthropic
}

export type GenerateReplyResult = {
  text: string
  usage: Usage
}

export async function generateReply(
  args: GenerateReplyArgs
): Promise<GenerateReplyResult> {
  const userMessage =
    `Compose a ${args.template} reply to this email. Follow the policy and ` +
    `voice guidance in the system prompt. Plain text only, no greeting line ` +
    `unless the template calls for one.\n\n` +
    `From: ${args.email.from_email}\n` +
    `Subject: ${args.email.subject}\n\n` +
    (args.email.body_text ?? "(empty body)")

  const response = await args.anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: INSTRUCTIONS_TEXT,
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || !("text" in textBlock) || !textBlock.text.trim()) {
    throw new Error("generate_reply: empty response from Haiku")
  }

  return {
    text: textBlock.text,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
    },
  }
}
```

- [ ] **Step 6.4: Run test → expect PASS**

```bash
pnpm --filter worker test
```

Expected: 2 passed.

- [ ] **Step 6.5: Commit**

```bash
git add apps/worker/src/lib/generate-reply.ts apps/worker/src/lib/__tests__/generate-reply.test.ts
git commit -m "Add generateReply helper for worker reply text generation"
```

---

## Task 7: Worker — auto-send for non-refund decisions

**Files:**
- Modify: `apps/worker/src/processors/email.ts`

- [ ] **Step 7.1: Read the current processor**

Re-read `apps/worker/src/processors/email.ts` (in this conversation's context already).

- [ ] **Step 7.2: Extend the processor for non-refund auto-send**

Modify `apps/worker/src/processors/email.ts`.

**(a)** Add these imports near the top (alongside existing imports — top-level, not dynamic):

```ts
import { sendReply, getAgentMailInboxId } from "@workspace/actions"
import { generateReply } from "../lib/generate-reply.js"
```

**(b)** The existing `email` select needs `agent_mail_message_id` (the value gets passed to `sendReply` as `inReplyToMessageId`):

```ts
.select("id, from_email, to_email, subject, body_text, agent_mail_message_id")
```

**(c)** After the existing block that writes the `decisions` row + `audit_log` (right before `return { decisionId: ... }` at the end of `processEmail`), add this dispatch block:

```ts
const isRefundDecision =
  dec.decision === "issue_refund" ||
  dec.decision === "issue_refund_chargeback"
const isReplyDecision =
  dec.decision === "send_offer_1" ||
  dec.decision === "send_offer_2" ||
  dec.decision === "send_faq_reply"
const isEscalate = dec.decision === "escalate"

if (isEscalate) {
  await supabase
    .from("decisions")
    .update({ status: "needs_human" })
    .eq("id", row.id)
} else if (isReplyDecision) {
  const templateMap = {
    send_faq_reply: "FAQ_REPLY",
    send_offer_1: "OFFER_1",
    send_offer_2: "OFFER_2",
  } as const
  const template = templateMap[dec.decision as keyof typeof templateMap]
  try {
    const reply = await generateReply({ template, email, anthropic })
    const sent = await sendReply({
      inboxId: getAgentMailInboxId(),
      inReplyToMessageId: email.agent_mail_message_id ?? "",
      replyText: reply.text,
      decisionId: row.id,
      supabase,
    })
    await supabase
      .from("decisions")
      .update({
        status: sent.ok ? "sent" : "failed",
        draft_reply_text: reply.text,
      })
      .eq("id", row.id)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await supabase
      .from("decisions")
      .update({ status: "failed" })
      .eq("id", row.id)
    await supabase.from("audit_log").insert({
      action: "generate_reply_failed",
      email_id: email.id,
      status: "failure",
      error,
      payload: { decision_id: row.id, template },
    })
  }
}
// Refund branches handled in Task 8.
```

- [ ] **Step 7.3: Restart the worker; sim a non-refund**

```bash
pnpm db:start   # if not already
pnpm dev        # in another terminal, or background
# Wait for "[worker] ready"
pnpm sim faq
```

Then query Supabase:

```bash
set -a; . .env.local; set +a
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/decisions?select=status,decision,draft_reply_text,emails(from_email)&order=created_at.desc&limit=3" | jq
```

Expected: latest charlie@sim.local row has `status: "sent"`, `decision: "send_faq_reply"`, `draft_reply_text` populated with a real reply.

Confirm an actual AgentMail outbound: check the AgentMail dashboard (the implementer should verify via the AgentMail UI that the message was sent).

- [ ] **Step 7.4: Sim `other` → escalate**

```bash
pnpm sim other
```

Query — expect `status: "needs_human"`, no outbound.

- [ ] **Step 7.5: Commit**

```bash
git add apps/worker/src/processors/email.ts
git commit -m "Worker auto-sends reply for non-refund decisions; escalate → needs_human"
```

---

## Task 8: Worker — refund decisions land in `pending_approval` with pre-generated draft

**Files:**
- Modify: `apps/worker/src/processors/email.ts`

- [ ] **Step 8.1: Extend the dispatch block for refund branches**

In `apps/worker/src/processors/email.ts`, add a third branch alongside `isEscalate` / `isReplyDecision`:

```ts
} else if (isRefundDecision) {
  const templateMap = {
    issue_refund: "REFUND_CONFIRMATION",
    issue_refund_chargeback: "REFUND_CHARGEBACK_APOLOGY",
  } as const
  const template = templateMap[dec.decision as keyof typeof templateMap]
  try {
    const reply = await generateReply({ template, email, anthropic })
    await supabase
      .from("decisions")
      .update({
        status: "pending_approval",
        draft_reply_text: reply.text,
      })
      .eq("id", row.id)
    await supabase.from("audit_log").insert({
      action: "refund_pending_approval",
      email_id: email.id,
      status: "success",
      payload: {
        decision_id: row.id,
        template,
        draft_reply_text: reply.text,
        usage: reply.usage,
      },
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await supabase
      .from("decisions")
      .update({ status: "failed" })
      .eq("id", row.id)
    await supabase.from("audit_log").insert({
      action: "generate_reply_failed",
      email_id: email.id,
      status: "failure",
      error,
      payload: { decision_id: row.id, template },
    })
  }
}
```

- [ ] **Step 8.2: Restart worker, sim a refund ladder**

The previous C/D verification used these scenarios; re-run them:

```bash
pnpm sim refund1   # alice 1st — auto-sends Offer 1
pnpm sim refund2   # alice 2nd — auto-sends Offer 2
pnpm sim refund3   # alice 3rd — issue_refund → status='pending_approval' + draft
```

Query Supabase:

```bash
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/decisions?select=status,decision,draft_reply_text,emails(from_email,subject)&order=created_at.desc&limit=5" | jq
```

Expected:
- refund1, refund2: `status='sent'`, draft populated, AgentMail outbound visible in dashboard.
- refund3: `status='pending_approval'`, `draft_reply_text` is a real refund-confirmation reply.

- [ ] **Step 8.3: Sim chargeback × 2 (Sonnet path)**

```bash
pnpm sim chargeback   # Bob 1st — Offer 1 auto-sends
pnpm sim chargeback   # Bob 2nd — Sonnet escalation; status='pending_approval'
```

Query: confirm Bob 2nd lands at `pending_approval` with `template_used='REFUND_CHARGEBACK_APOLOGY'` and `audit_log` payload has both `haiku` and `sonnet` usage.

- [ ] **Step 8.4: Commit**

```bash
git add apps/worker/src/processors/email.ts
git commit -m "Worker queues refund decisions at pending_approval with pre-generated draft"
```

---

## Task 9: Reword the `instructions/` system-prompt store for approval semantics

**Files:**
- Modify: `instructions/policies/refund.md`, `instructions/tone/voice.md`, `instructions/policies/common-questions.md`

- [ ] **Step 9.1: Edit `instructions/policies/refund.md`**

Find: `If they reply with anything that still reads as refund intent, the next message issues the refund.`

Replace with: `If they reply with anything that still reads as refund intent, the next message is a refund decision — recorded and queued for the operator to approve. The agent does not issue refunds directly.`

Find: `If the second email contains any chargeback or dispute language, **skip the offer ladder entirely and issue an immediate refund + apology**.`

Replace with: `If the second email contains any chargeback or dispute language, **skip the offer ladder entirely — the decision tree records this as a refund + chargeback apology, which the operator approves before money moves**.`

Find: `By the third request the goodwill window is closed. Issue the refund, send a brief confirmation, and log the case for trend analysis (multiple refund-attempts is a product-quality signal).`

Replace with: `By the third request the goodwill window is closed. The decision tree records the refund (pending operator approval); the confirmation reply is composed in advance and sent automatically once approved. Multiple refund-attempts is a product-quality signal worth logging.`

- [ ] **Step 9.2: Edit `instructions/tone/voice.md` — refund section header**

Find: `## On refund replies specifically`

Replace the section opening sentence (just after the header):

After the header, change:
- `**Issue the refund first, then explain.** Don't make the customer wait through a paragraph of context before learning their money is on the way.`

To:
- `**The refund confirmation reply runs after operator approval — when it goes out, the refund is already in flight.** Lead with the action ("refund issued — you'll see X back…"), then explain. Don't make the customer wait through a paragraph of context before learning their money is on the way.`

(The "Good" example wording stays — it's still the right post-approval reply.)

- [ ] **Step 9.3: Edit `instructions/policies/common-questions.md`**

Find: `A: Pull up the ClickBank order history for that email and confirm whether it's a duplicate or two distinct purchases (sometimes a subscription renewal happens the same day as a one-off purchase). If it's truly a duplicate, refund the second charge immediately and apologize — do not escalate to the retention ladder for duplicate-charge errors.`

Replace with: `A: Pull up the ClickBank order history for that email and confirm whether it's a duplicate or two distinct purchases (sometimes a subscription renewal happens the same day as a one-off purchase). If it's truly a duplicate, the decision is a refund + apology (queued for operator approval — the duplicate-charge path also requires approval, no carve-outs). Do not escalate to the retention ladder for duplicate-charge errors.`

- [ ] **Step 9.4: Commit (do not run sim yet — that's Task 10)**

```bash
git add instructions/policies/refund.md instructions/tone/voice.md instructions/policies/common-questions.md
git commit -m "Reword instructions/ store for approval semantics"
```

---

## Task 10: Re-verify slices C and D after instructions rewording

This is a **verification step**, not a code change. The instructions rewording can subtly shift Haiku's classification confidence or the Sonnet chargeback judgment — re-run the 7-scenario sim and confirm no drift.

- [ ] **Step 10.1: Clean up sim test data**

If the previous tasks left `@sim.local` rows mid-state (some sent, some pending), purge sim rows so the refund ladder starts fresh:

```bash
set -a; . .env.local; set +a
# Get sim email ids first
SIM_IDS=$(curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/emails?select=id&from_email=ilike.*sim.local*" | jq -r '.[].id' | tr '\n' ',' | sed 's/,$//')
# Delete dependent rows (decisions cascade via fk; audit_log just dangles email_id null)
curl -X DELETE -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/audit_log?email_id=in.($SIM_IDS)"
curl -X DELETE -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/threads?sender_email=ilike.*sim.local*"
# threads cascade-delete emails + decisions per the fk
```

Verify zero sim emails remain:

```bash
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/emails?select=id&from_email=ilike.*sim.local*" | jq 'length'
```

Expected: 0.

- [ ] **Step 10.2: Restart the worker (so it reloads INSTRUCTIONS_TEXT from disk)**

Stop and restart `pnpm dev`. Confirm the boot log still says `instructions loaded: ~XXXX tokens` and the count is still above 4096 (Haiku's cache floor).

- [ ] **Step 10.3: Fire all 7 scenarios in order**

```bash
for s in other faq refund1 refund2 chargeback chargeback refund3; do
  echo "### $s"
  pnpm sim "$s" 2>&1 | grep -E 'from:|HTTP|message:'
done
```

- [ ] **Step 10.4: Wait for the queue to drain, then verify the table**

```bash
set -a; . .env.local; set +a
printf "sender\tclassification\tdecision\ttemplate\tcount\tstatus\n"
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/decisions?select=created_at,classification,decision,template_used,refund_request_count,status,emails(from_email)&order=created_at.asc" \
  | jq -r '.[] | [(.emails.from_email | capture("<(?<a>[^>]+)>").a // .emails.from_email), .classification, .decision, (.template_used // "-"), (.refund_request_count|tostring), .status] | @tsv' \
  | column -t -s $'\t'
```

Expected table (post-instructions-rewording, matching the 2026-05-27 verification):

| sender | classification | decision | template | count | status |
|---|---|---|---|---|---|
| dave | other | escalate | - | null | needs_human |
| charlie | faq | send_faq_reply | - | null | sent |
| alice | refund_request | send_offer_1 | OFFER_1 | 1 | sent |
| alice | refund_request | send_offer_2 | OFFER_2 | 2 | sent |
| bob | refund_request | send_offer_1 | OFFER_1 | 1 | sent |
| bob | refund_request | issue_refund_chargeback | REFUND_CHARGEBACK_APOLOGY | 2 | pending_approval |
| alice | refund_request | issue_refund | REFUND_CONFIRMATION | 3 | pending_approval |

If any classification or decision shifts, return to Task 9 and tighten the rewording until it doesn't.

- [ ] **Step 10.5: Confirm prompt-cache reuse still works**

```bash
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/audit_log?select=payload&action=eq.classify_email&order=created_at.asc&limit=2" \
  | jq '.[] | .payload.usage.haiku | {cache_read_input_tokens, cache_creation_input_tokens}'
```

Expected: first call shows `cache_creation_input_tokens > 0`, `cache_read_input_tokens=0`. Second call shows `cache_read_input_tokens > 0`. The exact token count may shift by a few percent (rewording changes the cached block); cache reuse still works.

- [ ] **Step 10.6: Commit verification evidence**

No code change — only doc/log. Optionally capture findings to the slice doc:

```bash
git commit --allow-empty -m "Verify slices C/D end-to-end after instructions rewording (7 scenarios pass)"
```

---

## Task 11: Dashboard `/approvals` route — server component + table

**Files:**
- Create: `apps/web/app/(overview)/approvals/page.tsx`, `apps/web/components/approvals-table.tsx`, `apps/web/lib/decisions.ts`
- Modify: `apps/web/components/nav-main.tsx`, `apps/web/components/status-badges.tsx`

- [ ] **Step 11.1: Add the query helper**

Create `apps/web/lib/decisions.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@workspace/db/types"

export type PendingApprovalRow = {
  id: string
  receivedAt: string
  sender: string
  subject: string
  classification: string
  decision: string
  templateUsed: string | null
  llmReasoning: string | null
  draftReplyText: string | null
}

export async function fetchPendingApprovals(
  supabase: SupabaseClient<Database>
): Promise<PendingApprovalRow[]> {
  const { data, error } = await supabase
    .from("decisions")
    .select(
      "id, created_at, classification, decision, template_used, llm_reasoning, draft_reply_text, emails(from_email, subject)"
    )
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false })
  if (error) throw new Error(`fetchPendingApprovals: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id,
    receivedAt: row.created_at,
    sender: row.emails?.from_email ?? "(unknown)",
    subject: row.emails?.subject ?? "(no subject)",
    classification: row.classification ?? "",
    decision: row.decision ?? "",
    templateUsed: row.template_used,
    llmReasoning: row.llm_reasoning,
    draftReplyText: row.draft_reply_text,
  }))
}
```

- [ ] **Step 11.2: Create the SSR page**

Create `apps/web/app/(overview)/approvals/page.tsx`:

```tsx
import { getServerSupabase } from "@/lib/supabase-server"
import { fetchPendingApprovals } from "@/lib/decisions"
import { ApprovalsTable } from "@/components/approvals-table"

export const dynamic = "force-dynamic"

export default async function ApprovalsPage() {
  const supabase = getServerSupabase()
  const rows = await fetchPendingApprovals(supabase)
  return (
    <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Refund approvals</h1>
        <p className="text-muted-foreground text-sm">
          {rows.length} pending — refunds always require human approval before
          any ClickBank refund or confirmation reply.
        </p>
      </div>
      <ApprovalsTable initial={rows} />
    </div>
  )
}
```

- [ ] **Step 11.3: Create the table component (server-rendered, no Realtime in this slice — refresh-on-action is enough)**

Create `apps/web/components/approvals-table.tsx`:

```tsx
"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Button } from "@workspace/ui/components/button"
import { approveRefund, rejectRefund } from "@/lib/approvals"
import type { PendingApprovalRow } from "@/lib/decisions"

export function ApprovalsTable({ initial }: { initial: PendingApprovalRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (initial.length === 0) {
    return (
      <div className="rounded-lg border p-10 text-center text-muted-foreground">
        No refunds awaiting approval.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead>Sender</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Draft reply</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {initial.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="max-w-50 truncate font-medium">
                {r.sender}
              </TableCell>
              <TableCell className="max-w-60 truncate text-muted-foreground">
                {r.subject}
              </TableCell>
              <TableCell className="text-xs">{r.templateUsed ?? "-"}</TableCell>
              <TableCell className="max-w-96 truncate text-muted-foreground">
                {r.draftReplyText ?? "(no draft)"}
              </TableCell>
              <TableCell className="flex justify-end gap-2 text-right">
                <Button
                  variant="default"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await approveRefund(r.id)
                      router.refresh()
                    })
                  }
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await rejectRefund(r.id)
                      router.refresh()
                    })
                  }
                >
                  Reject
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 11.4: Add a sidebar entry**

Modify `apps/web/components/nav-main.tsx` — add an item after Activity:

```tsx
{
  title: "Approvals",
  href: "/approvals",
  icon: IconClipboardCheck, // import from @tabler/icons-react if not already
},
```

Make sure `IconClipboardCheck` is imported from `@tabler/icons-react` alongside existing icons.

- [ ] **Step 11.5: Stub the server actions so the page builds (full impl in Task 12)**

Create `apps/web/lib/approvals.ts` (stub for now — Task 12 replaces):

```ts
"use server"

export async function approveRefund(decisionId: string): Promise<void> {
  // Stub — implemented in Task 12.
  void decisionId
}

export async function rejectRefund(decisionId: string): Promise<void> {
  // Stub — implemented in Task 12.
  void decisionId
}
```

- [ ] **Step 11.6: Verify the page renders**

```bash
pnpm dev
# Open http://localhost:3000/approvals in a browser
```

Expected: page renders. Pending decisions (from Task 10's sim) appear with sender / subject / template / draft preview / Approve & Reject buttons. Clicking either currently does nothing (Task 12 wires them).

Take a screenshot for the slice verification.

- [ ] **Step 11.7: Commit**

```bash
git add apps/web/app/\(overview\)/approvals/ apps/web/components/approvals-table.tsx apps/web/lib/decisions.ts apps/web/lib/approvals.ts apps/web/components/nav-main.tsx
git commit -m "Add /approvals route with refund-approval queue UI"
```

---

## Task 12: Server actions — `approveRefund` and `rejectRefund`

**Files:**
- Modify: `apps/web/lib/approvals.ts` (replace the stub)

- [ ] **Step 12.1: Implement `approveRefund` with race-safe update**

Replace `apps/web/lib/approvals.ts` with the real implementation:

```ts
"use server"

import {
  sendReply,
  refundCustomer,
  getAgentMailInboxId,
} from "@workspace/actions"
import { getServerSupabase } from "@/lib/supabase-server"

const APPROVER = "mvp-operator" // placeholder until auth lands

export async function approveRefund(decisionId: string): Promise<void> {
  const supabase = getServerSupabase()

  // Race-safe state transition: only proceed if still pending_approval.
  const { data: claimed, error: claimErr } = await supabase
    .from("decisions")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: APPROVER })
    .eq("id", decisionId)
    .eq("status", "pending_approval")
    .select(
      "id, draft_reply_text, emails(id, from_email, agent_mail_message_id, body_text)"
    )
    .maybeSingle()

  if (claimErr) throw new Error(`approveRefund.claim: ${claimErr.message}`)
  if (!claimed) {
    // Already handled by another approver — no-op.
    await supabase.from("audit_log").insert({
      action: "approve_refund_noop",
      status: "skipped",
      payload: { decision_id: decisionId, reason: "not_pending_or_already_handled" },
    })
    return
  }

  const email = claimed.emails
  if (!email) throw new Error(`approveRefund: email row missing for decision ${decisionId}`)

  const orderId = extractOrderId(email.body_text)

  // Refund first.
  const refund = await refundCustomer({
    decisionId,
    customerEmail: email.from_email,
    orderId,
    amount: null,
    supabase,
  })
  if (!refund.ok) {
    // Rewind status so a human can retry.
    await supabase
      .from("decisions")
      .update({ status: "pending_approval", approved_at: null, approved_by: null })
      .eq("id", decisionId)
    await supabase.from("audit_log").insert({
      action: "approve_refund_failed",
      status: "failure",
      error: refund.error,
      payload: { decision_id: decisionId, step: "refundCustomer" },
    })
    return
  }

  // Notify second.
  const sent = await sendReply({
    inboxId: getAgentMailInboxId(),
    inReplyToMessageId: email.agent_mail_message_id ?? "",
    replyText: claimed.draft_reply_text ?? "",
    decisionId,
    supabase,
  })

  if (sent.ok) {
    await supabase
      .from("decisions")
      .update({ status: "sent" })
      .eq("id", decisionId)
  } else {
    // Refund succeeded but notify failed — capture the partial state.
    await supabase
      .from("decisions")
      .update({ status: "failed" })
      .eq("id", decisionId)
    await supabase.from("audit_log").insert({
      action: "approve_refund_failed",
      status: "failure",
      error: sent.error,
      payload: {
        decision_id: decisionId,
        step: "sendReply",
        refund_id_already_issued: refund.refundId,
      },
    })
  }
}

export async function rejectRefund(
  decisionId: string,
  reason?: string
): Promise<void> {
  const supabase = getServerSupabase()
  const { data: claimed, error } = await supabase
    .from("decisions")
    .update({
      status: "rejected",
      approved_at: new Date().toISOString(),
      approved_by: APPROVER,
    })
    .eq("id", decisionId)
    .eq("status", "pending_approval")
    .select("id")
    .maybeSingle()
  if (error) throw new Error(`rejectRefund: ${error.message}`)
  await supabase.from("audit_log").insert({
    action: claimed ? "reject_refund" : "reject_refund_noop",
    status: claimed ? "success" : "skipped",
    payload: { decision_id: decisionId, reason: reason ?? null },
  })
}

const ORDER_RE = /order\s*#?\s*([A-Z0-9-]+)/i

function extractOrderId(body: string | null): string | null {
  if (!body) return null
  const m = body.match(ORDER_RE)
  return m ? (m[1] ?? null) : null
}
```

- [ ] **Step 12.2: Drive approval end-to-end in the browser**

Open `http://localhost:3000/approvals`. With Task 10's data in place, there should be 2 pending refunds (Bob's chargeback escalation, Alice's #3).

Click **Approve** on Alice's row. Expected:
- Row disappears from the list (page refreshes).
- Query confirms `status='sent'`, `approved_at` is set, `approved_by='mvp-operator'`.
- Two audit_log entries: `refund_customer_stub` (success, refund_id starts with `stub-`) and `send_reply` (success, sent_message_id from AgentMail).
- AgentMail dashboard shows an outbound reply.

```bash
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/decisions?select=status,approved_at,approved_by,emails(from_email)&order=created_at.desc&limit=5" | jq
```

- [ ] **Step 12.3: Test the Reject path**

Click **Reject** on Bob's row. Expected:
- Row disappears.
- `status='rejected'`; audit_log has `reject_refund`.
- No AgentMail outbound; no refund_customer_stub call.

- [ ] **Step 12.4: Test the race-condition path**

Open `/approvals` in two browser tabs (use Playwright if scripting). Click Approve on the same row in tab A, then within ~500ms in tab B.

Expected:
- Tab A: row disappears, `status='sent'`.
- Tab B: refresh; row was already gone. Audit log shows `approve_refund_noop` with `reason: "not_pending_or_already_handled"`.

- [ ] **Step 12.5: Commit**

```bash
git add apps/web/lib/approvals.ts
git commit -m "Implement approveRefund + rejectRefund with race-safe state transitions"
```

---

## Task 13: End-to-end verification per the spec's testing table

This is the **slice acceptance** step. Reproduce every row of the spec's testing strategy table in one continuous run and capture evidence.

- [ ] **Step 13.1: Clean baseline**

Purge sim data again (same commands as Step 10.1). Confirm zero `@sim.local` emails.

- [ ] **Step 13.2: Run the full scenario suite + capture outcomes**

```bash
for s in other faq refund1 refund2 chargeback chargeback refund3; do
  echo "### sim: $s"
  pnpm sim "$s" 2>&1 | grep -E 'from:|HTTP|message:'
done
```

Wait ~30s for the queue to drain, then:

```bash
set -a; . .env.local; set +a
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/decisions?select=created_at,classification,decision,template_used,refund_request_count,status,llm_model,emails(from_email)&order=created_at.asc" | jq
```

Expected:

| # | sender | classification | decision | template | count | status | llm_model |
|---|---|---|---|---|---|---|---|
| 1 | dave | other | escalate | - | null | needs_human | claude-haiku-4-5 |
| 2 | charlie | faq | send_faq_reply | - | null | sent | claude-haiku-4-5 |
| 3 | alice | refund_request | send_offer_1 | OFFER_1 | 1 | sent | claude-haiku-4-5 |
| 4 | alice | refund_request | send_offer_2 | OFFER_2 | 2 | sent | claude-haiku-4-5 |
| 5 | bob | refund_request | send_offer_1 | OFFER_1 | 1 | sent | claude-haiku-4-5 |
| 6 | bob | refund_request | issue_refund_chargeback | REFUND_CHARGEBACK_APOLOGY | 2 | pending_approval | claude-haiku-4-5 + claude-sonnet-4-6 |
| 7 | alice | refund_request | issue_refund | REFUND_CONFIRMATION | 3 | pending_approval | claude-haiku-4-5 |

- [ ] **Step 13.3: Approve both refunds via the browser**

Open `/approvals` → confirm 2 rows (Bob's, Alice's #3). Click Approve on each. Confirm each transitions to `status='sent'` with audit_log entries and AgentMail outbound.

- [ ] **Step 13.4: Negative test — bad AGENT_MAIL_API_KEY**

Temporarily set `AGENT_MAIL_API_KEY=invalid` in `.env.local`. Restart `pnpm dev`. Run `pnpm sim faq`. Expected: `decisions.status='failed'`; `audit_log` has `send_reply` with `status='failure'` and the AgentMail error captured.

Restore the real key and restart.

- [ ] **Step 13.5: Race test (Playwright or two browser tabs)**

Open two tabs of `/approvals`. Fire `pnpm sim refund1` → wait for `pending_approval`. Click Approve in both tabs near-simultaneously. Confirm: one wins (`status='sent'`), one logs `approve_refund_noop`.

- [ ] **Step 13.6: Final regression — re-run the typecheck/lint sweep**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all green.

- [ ] **Step 13.7: Update `docs/initial-plan.md` Current status**

Move slice E from "Remaining" to "Built + verified end-to-end (<today's date>)" with the appropriate sub-bullet describing what shipped. Move the "Reconcile the instructions/ store" remaining bullet to completed (it was Task 9). Update CLAUDE.md's Current state paragraph similarly (mention `@workspace/actions`, the `/approvals` route, the new status columns).

- [ ] **Step 13.8: Final commit**

```bash
git add docs/initial-plan.md CLAUDE.md
git commit -m "Mark slice E (action layer + refund approval queue) as shipped"
```

---

## Self-review checklist

Before handing off:

- **Spec coverage:** every section of the spec maps to a task. Goals 1–5: T5 (sendReply), T4 (refundCustomer), T11–T12 (approval queue), T7 (auto-send), T9 (instructions rewording). Non-goals stay non-goals. Architecture, data model, data flow, contracts, error handling, testing — all referenced in tasks.
- **Placeholder scan:** no TBD / TODO / "fill in" anywhere.
- **Type consistency:** `SendReplyArgs.inReplyToMessageId` is the AgentMail message id (matches `client.inboxes.messages.reply` signature). `decisions.status` enum values are consistent across migration, worker, server actions, badges. `template_used` values match `Template` type in `generate-reply.ts`.
- **Order:** Vitest → schema → actions package → action functions → worker integration → instructions rewording → C/D re-verify → dashboard route → server actions → end-to-end verification. Each step builds on the previous; no forward references.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Intent

This repository is an **Email Support Agent** — a webhook-driven system that ingests Agent Mail webhooks, classifies/decides via Claude, and **drafts** actions (reply or refund) that a human approves before anything is sent. It has grown from the original single-product MVP into a **multi-product, config-driven pipeline**. `docs/initial-plan.md` holds the original MVP spec, refund decision tree, and cost model — useful history, but the live system (multiple products/inboxes, a DB-driven decision flow, in-app prompt/template/trigger editing, and approval-gated actions) has moved past it. Treat this file plus the migrations in `packages/db/supabase/migrations` as the current source of truth.

Current state — the pipeline runs end to end and is **multi-product**:

- **`apps/api`** ingests the Agent Mail webhook, **routes it by inbox → product** (`inboxes.agent_mail_inbox_id`, falling back to the `default` product), persists `threads`/`emails`, and enqueues a `process_email` job.
- **`apps/worker`** runs a **DB-driven flow** (`flow_steps`, per-inbox or a global default): `spam_filter → classify → lookup_gate → enrich → decide → draft`. It classifies with Haiku 4.5, optionally looks up the customer's order/access via a per-product adapter (ClickBank/JVZoo — stubbed), runs the refund decision tree (request count + chargeback regex + Sonnet 4.6 confirmation, threshold from `action_triggers`), and **writes a drafted `decisions` row**. Prompts come from the `prompt_configs` table (not markdown) and reusable snippets from `prompt_templates`.
- **Nothing auto-sends.** Every decision is drafted and routed to a human. Decision values: `send_faq_reply` / `escalate` / `send_offer_1` / `send_offer_2` / `issue_refund` / `issue_refund_chargeback` / `quarantine_spam`; statuses: `pending_approval` / `needs_human` / `quarantined` / `failed`. A human approves/rejects in `/approvals` (and per-thread in `/tickets/[id]`); approval fires `sendReply` (Agent Mail) or `refundCustomer` (ClickBank — still a stub pending credentials) from `packages/actions`, writing real `approved_by = user.email`.
- **`apps/web`** is the oversight + admin dashboard: live ticket feed, approval queue, and CRUD for products, inboxes, credentials, triggers, flows, prompts, templates, and users.

**Auth** is implemented — Supabase email/password sign-in via `proxy.ts` + a `profiles` allow-list; an **admin** (`profiles.role = 'admin'`) creates/edits/deletes users and sets their initial password in `/users`; service-role SSR reads continue (doorman model). **Every outbound action requires human approval before execution — a firm project rule, not a trust-building default; refunds especially.**

The dashboard reads `threads`/`emails`/`decisions`/`audit_log` live (Server-Component SSR + Supabase Realtime), gated by the `authenticated` SELECT RLS policy described under `packages/db` below.

**Verified against live models (2026-05-28):** slices C (Haiku classifier + caching), D (refund decision tree + Sonnet escalation), and E (action layer + approval queue) drove the full pipeline across simulated scenarios — classifier labels, the offer 1 → offer 2 → refund ladder, Sonnet-confirmed chargeback escalation, prompt-cache reuse, the approve/reject flows, and the audit trail all behaved as designed. **Since then the system moved to universal human approval** (the earlier auto-send of non-refund replies was removed) and the **DB-driven multi-step flow** described under `apps/worker`. The dashboard's `decisions` / `classification` columns populate live as the worker processes; see `docs/initial-plan.md` for the original refund-workflow spec and the `decisions` / `audit_log` shapes.

## Working Style

These four principles (adapted from <https://github.com/multica-ai/andrej-karpathy-skills>, derived from Karpathy's observations on LLM coding pitfalls) apply to every change in this repo. Explicit instructions in a given task override them; the system prompt's existing guidance reinforces them.

### Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

### Surgical Changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that your changes made unused; don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### Goal-Driven Execution

Define success criteria. Loop until verified.

- "Add validation" → "Write tests for invalid inputs, then make them pass."
- "Fix the bug" → "Write a test that reproduces it, then make it pass."
- "Refactor X" → "Ensure tests pass before and after."

For multi-step tasks, state a brief plan with verification per step.

## Commands

All commands are run from the repo root and dispatched by Turbo to the relevant workspaces:

```bash
pnpm dev          # turbo dev (starts apps/web, apps/api, apps/worker in parallel)
pnpm build        # turbo build
pnpm lint         # turbo lint
pnpm format       # turbo format (prettier --write)
pnpm typecheck    # turbo typecheck (tsc --noEmit)
pnpm db:start     # docker compose up -d redis (BullMQ broker for apps/worker)
pnpm db:stop      # docker compose down
```

To run a script in a single workspace, use `pnpm --filter <name> <script>` (e.g. `pnpm --filter web dev`, `pnpm --filter @workspace/ui typecheck`).

Vitest is the workspace test runner — `pnpm test` runs across the monorepo; per-workspace via `pnpm --filter <name> test`.

`packages/actions` is built to `dist/` (NodeNext `.ts` → `.js`) so Turbopack (Next.js) can resolve `@workspace/actions/*` subpath imports — `pnpm build` triggers it via Turbo's `^build` chain. On a fresh clone, run `pnpm build` once before `pnpm dev` or `pnpm --filter @workspace/actions build` if you only need the actions package. Follow-up: switch to Turbopack `experimental.extensionAlias` to drop the build step.

Node `>=20` and `pnpm@9.15.9` are required (declared in root `package.json`).

## Architecture

**Monorepo layout** (pnpm workspaces + Turbo):

- `apps/web` — Next.js 16 (App Router, Turbopack, React 19) oversight + admin dashboard. Routes live under the `(overview)` layout group: `/` (stat cards + volume/handled charts), `/tickets` + `/tickets/[id]` (thread list + detail with emails, audit log, and approve/reject UI), `/activity` (action log), `/approvals` (approval queue), `/products` + `/products/[id]` (product list + per-product detail: encrypted API keys, support config, agent-check summary), `/inboxes`, `/credentials`, `/triggers` (refund thresholds), `/flows` (per-inbox step flow + step-prompt overrides), `/prompts` (`prompt_configs` editor), `/templates` (`prompt_templates` CRUD), and `/users` (admin-only); plus `/login` and `/no-access` outside the group. Pages are async Server Components that read via the secret-key client (`lib/supabase/server.ts`, `server-only`); client islands subscribe to Supabase Realtime via the publishable-key browser client (`lib/supabase/client.ts`) and refetch on change. Route protection is in `proxy.ts` (Next.js middleware). `lib/` pairs a data/query helper with an admin-gated server-action module per feature (`products.ts` + `product-actions.ts`, `credentials.ts` + `credential-actions.ts`, and likewise for `inboxes`/`triggers`/`flow-steps`/`prompts`/`templates`/`users`); mutations re-check the caller's admin role. Components are organized by feature — `components/<feature>/` (`tickets/`, `approvals/`, `activity/`, `reports/`, `products/`, `inboxes/`, `credentials/`, `triggers/`, `flow/`, `prompts/`, `templates/`, `users/`) — with `components/shared/` for cross-feature primitives (search-bar, table-pagination, status-badges; the URL-driven `?query=`/`?page=`/`?size=` pattern) and `components/layout/` for the app shell. `next.config.mjs` loads the repo-root `.env.local` via `@next/env` and transpiles `@workspace/ui` + `@workspace/db`.
- `apps/api` — Hono webhook server (plain Node, ESM, NodeNext). Entry `src/index.ts` → `src/app.ts` via `@hono/node-server` on `PORT` (default 3001). `GET /health` returns `{ status: "ok" }`; `POST /webhooks/agent-mail` (`src/routes/webhooks.ts`) verifies the Svix signature, parses the AgentMail envelope with Zod (`src/lib/agent-mail-schema.ts`), **resolves inbox → product routing** (`src/lib/inbox-routing.ts` looks up `inboxes.agent_mail_inbox_id`, falling back to the `default` product so no email is dropped), upserts a `threads` row by `agent_mail_thread_id` (carrying `product_id`/`inbox_id`), inserts an `emails` row (idempotent via the unique `agent_mail_message_id`), enqueues a `process_email` job, and audit-logs each branch. Dev via `tsx watch`.
- `apps/worker` — BullMQ consumer (plain Node, ESM, NodeNext). Connects to Redis via `REDIS_URL`, listens on the `emails` queue (`QUEUE_EMAILS` in `src/queues.ts`) for `process_email` jobs. `src/processors/email.ts` loads the per-inbox **flow** (or the global default) from `flow_steps` and runs the ordered steps in `src/lib/flow/` (`load-flow.ts` / `run-flow.ts` / `registry.ts`, with steps under `src/lib/flow/steps/`): `spam_filter → classify → lookup_gate → enrich → decide → draft`. Spam, classification, and lookup-gating use Haiku 4.5 with a prompt-cached system block; `decide` runs the refund decision tree (`src/lib/refund-decision.ts`: prior-request count for the normalized sender over 30 days via `src/lib/email-address.ts`, chargeback regex, **Sonnet 4.6** confirmation only when count ≥ 2 and the regex matches, threshold from `action_triggers`); `enrich` calls the per-product order/access adapter (ClickBank/JVZoo — stubbed). The system prompt is assembled from `prompt_configs` in `src/lib/instructions.ts` (cached), and `prompt_templates` snippets are injected into the reply draft (`src/lib/templates.ts` + `generate-reply.ts`). **Every step only drafts** — the worker writes one `decisions` row (`decision` + `status` + `draft_reply_text` + `proposed_actions` + enrichment `context`) plus an audit entry, and never calls `sendReply`/`refundCustomer` (a test asserts this). Dev via `tsx watch`.
- `instructions/` — Legacy markdown prompt store (`README.md`, `classifier.md`, `policies/*.md`, `tone/*.md`). **No longer loaded at runtime** — system prompts now live in the `prompt_configs` table, assembled by `apps/worker/src/lib/instructions.ts`, edited in-app at `/prompts`, and seeded via `scripts/seed-prompts.mjs`. The markdown remains as reference/seed content; editing it changes nothing until re-seeded.
- `packages/ui` — Shared shadcn/ui component library. Exports under subpaths (`@workspace/ui/components/*`, `@workspace/ui/lib/*`, `@workspace/ui/hooks/*`, `@workspace/ui/globals.css`, `@workspace/ui/postcss.config`). The exports map is the contract — add new entries here when introducing new subpaths.
- `packages/db` — Shared Supabase access. `createServerClient({ url, secretKey })` returns a typed `SupabaseClient<Database>`. Schema in `packages/db/supabase/migrations/*.sql` (managed by the Supabase CLI; system install on PATH). Core tables: `products` + `inboxes` (multi-product routing), `threads` + `emails` (ingested mail), `decisions` (one drafted decision per email — `decision` / `status` / `draft_reply_text` / `proposed_actions` / `context` / `product_id`), `audit_log`, `profiles` (auth allow-list + `role`), `suppression_list`, plus the in-app-edited config tables `prompt_configs`, `prompt_templates`, `flow_steps`, `action_triggers`, and `integration_credentials` (AES-256-GCM ciphertext). RLS is on for every table: most carry an `authenticated` SELECT policy (doorman model — browser reads gated, the service-role server reads freely), `profiles` restricts reads to the owning user, and `integration_credentials` denies the browser entirely (only the secret-key server decrypts). Types regenerated via `pnpm --filter @workspace/db gen-types` after `supabase link --project-ref <ref>`.
- `packages/eslint-config` — `@workspace/eslint-config` with `base`, `next-js`, `react-internal` configs.
- `packages/typescript-config` — `@workspace/typescript-config` with `base.json` and `nextjs.json`. Root `tsconfig.json` extends `base.json`.

**Turbo task graph** (`turbo.json`): `build`, `lint`, `format`, `typecheck` all use `dependsOn: ["^build" | "^lint" | ...]`, so workspace packages must be buildable in dependency order. `dev` is `cache: false, persistent: true`. `.env*` is included in build inputs.

**Styling stack**: Tailwind CSS 4 (PostCSS via `@tailwindcss/postcss`). Global styles live at `packages/ui/src/styles/globals.css` and are imported by `apps/web/app/layout.tsx` via `@workspace/ui/globals.css`. Prettier is configured with `prettier-plugin-tailwindcss` pointing at that same stylesheet, and recognizes `cn` and `cva` as Tailwind class functions — keep those names when wrapping classes.

**Components**: shadcn/ui via `apps/web/components.json` with style `radix-mira`, icon library `tabler`, `baseColor: neutral`, CSS variables enabled. The `ui` alias points at `@workspace/ui/components`, so `npx shadcn@latest add <component>` writes into the shared package, not `apps/web`. Existing `Button` uses CVA with `data-slot`/`data-variant`/`data-size` attributes — match that pattern for new variants.

**Theming**: `next-themes` with a custom `ThemeHotkey` component (`apps/web/components/layout/theme-provider.tsx`) that toggles dark/light on the **`d` key**, skipping input/textarea focus. Preserve this behavior when refactoring the theme provider.

**TypeScript**: `strict` + `noUncheckedIndexedAccess` are on at the base level. `module`/`moduleResolution` is `NodeNext` in `base.json` but overridden to `Bundler`/`ESNext` in `nextjs.json`.

## Conventions

- Prettier: no semicolons, double quotes, 2-space indent, trailing commas `es5`, LF line endings. Don't fight the formatter.
- ESLint 9 (flat config). Workspace configs are consumed from `@workspace/eslint-config/<variant>` — extend rather than redefine when adding rules.
- Shared utility `cn()` lives at `@workspace/ui/lib/utils` (clsx + tailwind-merge). Use it for conditional class composition rather than string concatenation.

## Claude Code Skills

`.agents/skills/` and `skills-lock.json` pin a set of skills relevant to this stack (Next.js, shadcn, Supabase Postgres, Turborepo, Vercel React/composition patterns, webapp testing, frontend-design). Prefer these over web search when they apply.

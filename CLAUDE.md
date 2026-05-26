# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Intent

This repository is the scaffold for an **Email Support Agent** — a webhook-driven system that ingests Agent Mail webhooks, classifies/decides via Claude, and acts (reply or refund via ClickBank). See `docs/initial-plan.md` for the full MVP spec, refund decision tree, cost model, and 4-day build timeline. The plan is the source of truth for architectural decisions until the backend lands.

Current state: `apps/web` (Next.js dashboard scaffold), `apps/api` (Hono webhook server with Agent Mail Svix-verified webhook → Supabase persist → BullMQ enqueue), `apps/worker` (BullMQ consumer that classifies each email via Claude Haiku 4.5 with prompt-cached instructions and writes a `decisions` row), `packages/db` (shared Supabase client + migrations), and `instructions/` (markdown system-prompt store loaded by the worker). Refund decision tree (slice D), action layer `sendReply`/`refundCustomer` (slice E), and dashboard pages reading from Supabase Realtime (slice F) from `docs/initial-plan.md` are **not yet implemented**.

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

There is no test runner configured yet — add one to the relevant workspace before claiming a test command exists.

Node `>=20` and `pnpm@9.15.9` are required (declared in root `package.json`).

## Architecture

**Monorepo layout** (pnpm workspaces + Turbo):

- `apps/web` — Next.js 16 (App Router, Turbopack, React 19) dashboard. Imports UI from `@workspace/ui`; transpiled via `next.config.mjs`'s `transpilePackages`.
- `apps/api` — Hono webhook server (plain Node, ESM, NodeNext). Entry at `src/index.ts` via `@hono/node-server` on `PORT` (default 3001). `/health` returns `{ status: "ok" }`; `POST /webhooks/agent-mail` verifies the Svix signature, parses the AgentMail wire-format envelope with Zod, upserts a `threads` row by `agent_mail_thread_id`, inserts an `emails` row (idempotent via the unique `agent_mail_message_id`), enqueues a `process_email` job to BullMQ, and audit-logs each branch. Dev via `tsx watch`.
- `apps/worker` — BullMQ consumer (plain Node, ESM, NodeNext). Connects to Redis via `REDIS_URL`, listens on the `emails` queue (constant exported from `src/queues.ts`). The processor in `src/processors/email.ts` fetches the email row, calls Claude Haiku 4.5 with a single `cache_control` block over the concatenated `instructions/*.md`, parses `{classification, reasoning}` via Zod, writes a `decisions` row, and audit-logs Anthropic cache stats. Dev via `tsx watch`.
- `instructions/` — Markdown system-prompt store loaded once at worker startup and concatenated into one cached block (`cache_control: {type: "ephemeral", ttl: "1h"}`). Lives at `instructions/README.md`, `classifier.md`, `policies/*.md`, `tone/*.md`. Edit and **restart the worker** to apply changes; the boot log prints the combined token count so you can confirm it's above Haiku 4.5's 4096-token cache floor.
- `packages/ui` — Shared shadcn/ui component library. Exports under subpaths (`@workspace/ui/components/*`, `@workspace/ui/lib/*`, `@workspace/ui/hooks/*`, `@workspace/ui/globals.css`, `@workspace/ui/postcss.config`). The exports map is the contract — add new entries here when introducing new subpaths.
- `packages/db` — Shared Supabase access. `createServerClient({ url, secretKey })` returns a typed `SupabaseClient<Database>`. Schema in `packages/db/supabase/migrations/*.sql` (managed by the Supabase CLI; system install on PATH). Types regenerated via `pnpm --filter @workspace/db gen-types` after `supabase link --project-ref <ref>`.
- `packages/eslint-config` — `@workspace/eslint-config` with `base`, `next-js`, `react-internal` configs.
- `packages/typescript-config` — `@workspace/typescript-config` with `base.json` and `nextjs.json`. Root `tsconfig.json` extends `base.json`.

**Turbo task graph** (`turbo.json`): `build`, `lint`, `format`, `typecheck` all use `dependsOn: ["^build" | "^lint" | ...]`, so workspace packages must be buildable in dependency order. `dev` is `cache: false, persistent: true`. `.env*` is included in build inputs.

**Styling stack**: Tailwind CSS 4 (PostCSS via `@tailwindcss/postcss`). Global styles live at `packages/ui/src/styles/globals.css` and are imported by `apps/web/app/layout.tsx` via `@workspace/ui/globals.css`. Prettier is configured with `prettier-plugin-tailwindcss` pointing at that same stylesheet, and recognizes `cn` and `cva` as Tailwind class functions — keep those names when wrapping classes.

**Components**: shadcn/ui via `apps/web/components.json` with style `radix-mira`, icon library `tabler`, `baseColor: neutral`, CSS variables enabled. The `ui` alias points at `@workspace/ui/components`, so `npx shadcn@latest add <component>` writes into the shared package, not `apps/web`. Existing `Button` uses CVA with `data-slot`/`data-variant`/`data-size` attributes — match that pattern for new variants.

**Theming**: `next-themes` with a custom `ThemeHotkey` component (`apps/web/components/theme-provider.tsx`) that toggles dark/light on the **`d` key**, skipping input/textarea focus. Preserve this behavior when refactoring the theme provider.

**TypeScript**: `strict` + `noUncheckedIndexedAccess` are on at the base level. `module`/`moduleResolution` is `NodeNext` in `base.json` but overridden to `Bundler`/`ESNext` in `nextjs.json`.

## Conventions

- Prettier: no semicolons, double quotes, 2-space indent, trailing commas `es5`, LF line endings. Don't fight the formatter.
- ESLint 9 (flat config). Workspace configs are consumed from `@workspace/eslint-config/<variant>` — extend rather than redefine when adding rules.
- Shared utility `cn()` lives at `@workspace/ui/lib/utils` (clsx + tailwind-merge). Use it for conditional class composition rather than string concatenation.

## Claude Code Skills

`.agents/skills/` and `skills-lock.json` pin a set of skills relevant to this stack (Next.js, shadcn, Supabase Postgres, Turborepo, Vercel React/composition patterns, webapp testing, frontend-design). Prefer these over web search when they apply.

# Email Support Agent

A webhook-driven email support agent. It takes in support email, uses Claude to classify each message and decide what to do, and drafts a reply or refund that a person approves before anything is sent. It is multi-product and config-driven, so new products, inboxes, prompts, and refund rules are managed in the dashboard instead of in code.

Every outbound action needs human approval. The worker only ever drafts. Nothing is sent or refunded on its own.

## How it works

1. Agent Mail delivers an inbound email to the webhook (`apps/api`).
2. The API checks the signature, routes the email to a product by its inbox (falling back to a `default` product so nothing is dropped), saves the thread and email, and queues a `process_email` job.
3. The worker (`apps/worker`) runs a per-inbox flow loaded from the database: `spam_filter → classify → lookup_gate → enrich → decide → draft`. It classifies with Claude, optionally looks up the customer's order or access through a per-product adapter, runs the refund decision tree, and writes one drafted decision.
4. A person reviews the draft in the dashboard (`apps/web`) and approves or rejects it. Approval is what fires the real action: send the reply through Agent Mail, or issue the refund.

Decision values: `send_faq_reply`, `escalate`, `send_offer_1`, `send_offer_2`, `issue_refund`, `issue_refund_chargeback`, `quarantine_spam`.

Statuses: `pending_approval`, `needs_human`, `quarantined`, `failed`.

## Repo layout

This is a pnpm plus Turborepo monorepo.

Apps:

- `apps/api` — Hono webhook server. Receives the Agent Mail webhook, routes inbox to product, saves the mail, and enqueues jobs. Runs on port 3001.
- `apps/worker` — BullMQ consumer. Runs the database-driven flow and writes drafted decisions. Never sends or refunds on its own.
- `apps/web` — Next.js dashboard. Live ticket feed, the approval queue, and admin CRUD for products, inboxes, credentials, triggers, flows, prompts, templates, and users. Runs on port 3000.

Packages:

- `packages/db` — Shared Supabase client and the SQL migrations that define the schema.
- `packages/actions` — The side-effecting actions (send reply, refund, suppress contact, MailWizz unsubscribe, internal alerts). Built to `dist/` so the web app can import it.
- `packages/ui` — Shared shadcn/ui component library.
- `packages/eslint-config`, `packages/typescript-config` — Shared config.

Other:

- `docs/` — Design notes and the original plan.
- `instructions/` — Legacy markdown prompts. No longer loaded at runtime; prompts now live in the database and are edited in the dashboard.
- `scripts/` — Simulation and eval helpers (webhook sim, ticket pull).
- `CLAUDE.md` — The detailed working guide for this repo. Read it for the full picture.

## Tech stack

- Next.js 16 (App Router, React 19), Tailwind CSS 4, shadcn/ui
- Hono for the webhook server
- BullMQ on Redis for the job queue
- Supabase (Postgres, Auth, Realtime) for data and auth
- Anthropic Claude for classification and the refund decision (Haiku for the light steps, Sonnet for the harder refund confirmation)
- Agent Mail for sending and receiving email
- TypeScript, Turborepo, pnpm workspaces
- Vitest for tests

## Getting started

Requirements: Node 20 or newer, pnpm 9.15.9, and Docker for local Redis.

```bash
# 1. Install
pnpm install

# 2. Set up env
cp .env.example .env.local
# then fill in the values (.env.example explains what each one is for)

# 3. Build once (so the web app can resolve @workspace/actions)
pnpm build

# 4. Start local Redis
pnpm db:start

# 5. Run web, api, and worker together
pnpm dev
```

The web app runs on http://localhost:3000 and the webhook API on http://localhost:3001.

## Common commands

Run these from the repo root:

```bash
pnpm dev          # start web, api, and worker together
pnpm build        # build all workspaces
pnpm lint         # lint
pnpm format       # prettier --write
pnpm typecheck    # tsc --noEmit
pnpm test         # run the vitest suite
pnpm db:start     # start local Redis
pnpm db:stop      # stop it
pnpm sim          # send one simulated webhook through the pipeline
pnpm sim:batch    # send a batch of simulated webhooks
```

To run a script in a single workspace, use `pnpm --filter <name> <script>` (for example `pnpm --filter web dev`).

Database types and migrations live in `packages/db`:

```bash
pnpm --filter @workspace/db gen-types    # regenerate types from the linked Supabase project
pnpm --filter @workspace/db migrate:new  # create a new migration
pnpm --filter @workspace/db migrate:up   # apply migrations
```

## Environment

Every env var is documented in `.env.example`. The main groups are Supabase, Redis, Anthropic, Agent Mail, the per-product credential encryption key, and the external integrations (Profit Dashboard, MailWizz). `APP_ENV` gates live external side effects. It is off by default and should be set to `production` only in the real deploy.

## Deployment

Deployed as a single stack on a VPS running Coolify with Docker Compose. One image is built for the whole monorepo (root `Dockerfile`) and run as four services that share it: `web`, `api`, `worker`, and `redis` (see `compose.coolify.yaml`). `NEXT_PUBLIC_*` vars must be set as build-time env in Coolify because they get inlined into the browser bundle. All other secrets are runtime env.

To check the containers locally before deploying:

```bash
docker compose --env-file .env.local -f compose.coolify.yaml -f compose.local.yaml up --build
```

## Key rules

- Every outbound action needs human approval. This is a firm rule, not a default, and it applies to refunds above all.
- The worker only drafts. It never calls send or refund directly, and a test enforces this.
- Prompts, templates, flows, and refund thresholds are edited in the dashboard, not in code.

For the full architecture, conventions, and history, see `CLAUDE.md` and the notes in `docs/`.

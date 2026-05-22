# Email Support Agent — MVP Game Plan

**Heads up before reading:** Going with Agent Mail for MVP per the call (the auto-generated meeting notes say SendGrid — confirming Agent Mail is what you meant). Plan assumes Agent Mail; trivial to swap if I misread.

## TL;DR

Webhook-driven email agent + a Next.js dashboard for live oversight. Agent Mail handles inbound/outbound (abstracted so we can swap to self-hosted later). Plain Node workers consume a Redis queue, call Claude via the Anthropic SDK with prompt caching, and either reply or trigger a ClickBank refund. Instructions live as version-controlled markdown. Dashboard gives you live visibility + approval workflow during the trust-building phase. MVP in 4 days. Scales to 1k+ emails/min without architectural changes. Blended cost ~$0.0007/email.

## Architecture

```
                                                              ┌──> Agent Mail (send reply)
Agent Mail ──webhook──> Hono API ──> BullMQ ──> Worker ───────┤
                          │                       │           └──> ClickBank API (refund)
                          ↓                       ↓
                       Supabase  ←─── audit log + state ──────┘
                          ↑
                       Realtime
                          ↓
              Next.js Dashboard (boss view)
```

Webhook handler returns 200 in <20ms (just enqueues); workers do the slow work async and in parallel. A 100-email burst doesn't block anything — emails pile into Redis and workers chew through them. Dashboard reads from Supabase via Realtime, so new tickets appear live without polling.

## Components

1. **Ingestion service** — Hono server. Verifies Agent Mail webhook signature, persists raw email to Supabase, enqueues processing job, returns 200.
2. **Queue** — Redis + BullMQ. Concurrency configurable per worker pool, retries with exponential backoff, dead-letter queue for failures needing human review.
3. **Worker pool** — N plain Node processes under PM2. Each worker pulls a job, fetches thread context + sender's email history, runs `classify → decide → act`, logs everything.
4. **Action layer** — Two functions for MVP: `sendReply(threadId, body)` (via Agent Mail) and `refundCustomer(orderId)` (via ClickBank API). Both fully audit-logged with reasoning trail.
5. **Instructions store** — Markdown in the repo, loaded into Claude context per request with prompt caching. Editing instructions = editing markdown, no deploy.
6. **Dashboard** — Next.js app, reads same Supabase tables the workers write to. Live ticket feed, review queue, audit log, stats.

## Tech stack

- **Runtime:** Node.js / TypeScript
- **Webhook server:** Hono
- **Queue:** Redis + BullMQ
- **DB:** Supabase (Postgres + RLS + Realtime)
- **LLM:** Anthropic SDK direct, with prompt caching on static blocks (instructions, FAQ, policies)
- **Process mgmt:** PM2
- **Dashboard:** Next.js 15 (App Router) + shadcn/ui + Tailwind + Supabase Auth
- **Deploy:** VPS (Hetzner or Railway) for workers; Vercel for dashboard (or same VPS)
- **Email I/O:** Agent Mail, abstracted behind `EmailReceiver` / `EmailSender` interfaces for easy future swap

No agent framework. The agent loop is `classify → decide → act` — a function, not a framework. Frameworks earn their keep on complex multi-turn autonomy; we don't have that here.

## Cost optimization (the two big levers)

**1. Prompt caching** — instructions, FAQ, refund policy, and product info are static per request. Anthropic prompt caching gives ~90% discount on cached input tokens and ~10x faster reads.

**2. Tiered routing** — most emails don't need expensive reasoning:
- Regex pre-filter (free, instant) → catches chargeback keywords, refund subject lines, obvious FAQ
- Haiku for classification (~$0.0001/email cached)
- Sonnet only for refund decisions + edge cases (~10% of traffic)

## Refund workflow spec

For every inbound message:

1. Classify intent. If not refund-related → handle as standard FAQ reply.
2. If refund: count prior refund requests from this sender (search same inbox, last 30 days).
3. Branch:
   - **Request #1** → send retention offer 1 (`[OFFER_1]`)
   - **Request #2**:
     - If message contains chargeback threat (regex pre-filter for "chargeback / dispute / bank / credit card company" → confirmed by Sonnet) → **immediate refund + apology**
     - Otherwise → send retention offer 2 (`[OFFER_2]`)
   - **Request #3+** → **immediate refund + confirmation reply**
4. Refund execution:
   - Call ClickBank API with order ID (parsed from email body, or looked up by customer email)
   - On success → send confirmation reply via Agent Mail
   - On failure → push to dead-letter queue, flag for human
5. Every decision logged: template used, refund decision, full LLM reasoning, API response

## Instructions / training storage

```
/instructions
  /products
    [PRODUCT_1].md          # description, features, FAQ
  /policies
    refund.md               # decision tree + templates ([OFFER_1], [OFFER_2])
    common-questions.md     # support FAQ
  /tone
    voice.md                # tone of voice guide
```

Agent loads only relevant files per request (saves tokens). Version-controlled in git so we can roll back instruction changes if reply quality regresses. Cached blocks get 5-min or 1-hour TTL depending on update cadence.

## Dashboard (oversight UI)

Built so you have live visibility into what the agent is doing — and a safety mechanism during the trust-building phase before fully autonomous operation.

**MVP scope:**

- **Live ticket feed** — inbox view, newest first. Each row: sender, subject, agent's classification, action taken, status. Click for full thread + agent reasoning + which instruction file was used.
- **Review queue** — toggleable "human approval required" mode. Replies sit in pending state before sending. One-click approve / edit / discard. Toggleable per category (e.g., always require approval for refunds, auto-send FAQ replies).
- **Action log** — every decision + why. Full audit trail.
- **Quick stats strip** — emails today, % auto-replied, % refunds, % retention saves, today's LLM cost.

**Rollout plan for week 1:**

System defaults to "all replies require approval." You see every reply, one-click approve or edit. Once you're comfortable (likely 2-3 days), we flip categories one at a time to autonomous: FAQ first, then retention offers, finally refunds. This is the safety mechanism — no autonomous reply goes to a real customer without you signing off in the first phase.

**v1.5 additions** (post-MVP):

- Instructions editor (edit markdown policies in-browser, commit to repo, hot-reload in workers)
- Customer search / lookup (all tickets for a given email)
- Manual reply composer (you can take over a thread directly)
- Performance trends over time
- A/B testing on retention offers

## Scaling: 100/min → 1k+/min

Architecture handles this natively. Only thing that changes is worker count.

- Webhook handler: single node handles 1k+ req/sec already
- Redis queue: trivial at this scale
- Workers: ~2-3s per email end-to-end with caching → 1 worker ≈ 20-30/min
  - 100/min = 4-5 workers
  - 1k/min = 35-50 workers
- Each worker is a cheap Node process under PM2 — horizontal scaling is just adding more
- Real bottlenecks at scale:
  - Anthropic API rate limits (tier-dependent — may need to upgrade)
  - ClickBank API rate limits (need to check their docs)
  - Agent Mail send limits (check plan tier)
- Circuit breakers + exponential backoff on every external call

## Cost estimate

Blended ~$0.0007/email (Haiku path: $0.0002, Sonnet path: $0.005, weighted 90/10):

| Volume | Daily | Monthly |
|---|---|---|
| 1k emails/day | ~$0.70 | ~$20 |
| 10k emails/day | ~$7 | ~$210 |
| 30k emails/day | ~$21 | ~$630 |

If reply quality holds with Haiku on more cases, this drops further. Drops harder if we route non-urgent replies through Anthropic's Batch API (50% discount).

## Migration path (Agent Mail → self-hosted)

Email I/O is abstracted behind 2 interfaces, so swapping providers is isolated. Candidates when we want to move:

- **Haraka** — Node SMTP server, plugin architecture, fits the stack best
- **Postal** — full mail platform with web UI, better for ops
- **Mailu** — Docker turnkey, easiest to stand up

Everything downstream (queue, workers, agents, storage, refund logic) stays untouched.

## Build timeline (4 days)

**Day 1 — Agent core**

- 0-1h: Agent Mail signup + webhook pointed at ngrok tunnel
- 1-3h: Hono webhook server + Supabase schema + Redis/BullMQ wired up
- 3-5h: Worker skeleton + Anthropic SDK with prompt caching + Haiku classifier
- 5-7h: Refund decision logic + templates (placeholders)
- 7-8h: ClickBank API stub + dead-letter handling

**Day 2 — Testing and polish**

- 0-4h: End-to-end test with synthetic emails, refine prompts
- 4-8h: Logging, audit trail, error handling, edge cases

**Day 3 — Dashboard**

- 0-2h: Next.js scaffold + Supabase auth + Realtime hooks
- 2-5h: Live ticket feed + full thread view + agent reasoning display
- 5-7h: Review queue with approve / edit / discard
- 7-8h: Quick stats strip

**Day 4 — Go-live**

- 0-2h: Replace ClickBank stub with real API (once access lands)
- 2-5h: End-to-end test through the dashboard
- 5-7h: Deploy workers to VPS + dashboard to Vercel
- 7-8h: First real emails flowing through, monitor live

## Open questions

- Timeline for ClickBank API access? (Day 4 assumes it's available by then; if not, we run on stub until it lands.)
- Current daily email volume (to right-size the worker pool for day 1)?
- Worth using SendGrid's inbound parse webhook instead of Agent Mail to avoid double-paying on email infra you already have? (Trade-off: SendGrid inbound parse works but is less agent-tooling-friendly than Agent Mail. Could be the eventual migration target instead of self-hosted.)
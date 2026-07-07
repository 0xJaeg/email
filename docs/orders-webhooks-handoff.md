# Orders webhooks + purchase lookup — handoff

## What this does

Direct platform order webhooks (JVZoo + Digistore) write into our **own `orders`
table**, and the `purchase_lookup` flow step queries that table by email. This
replaces the stubbed platform-API lookups. Ben's call (2026-07): own the purchase
signal directly so a customer's order is still visible even if a third-party
pipeline (Profit Dashboard) breaks. Profit Dashboard's email-lookup stays as the
**access** check, unchanged. This is only the **purchase** check.

## Status: LIVE (2026-07-07)

- Deployed (PRs #93, #95). Coolify tracks `main`.
- api live at **`https://api.onesupportcentre.com`** with a valid Let's Encrypt
  cert (Cloudflare A record, DNS only / grey cloud). Receivers respond
  (`/webhooks/jvzoo/health`, `/webhooks/digistore/health` → `{"status":"ok"}`).
- `orders` migration applied to `dlwc`.
- Both IPN secrets set in Coolify (a POST returns `400 invalid_signature`, not
  `500`).
- **Digistore is live**: signature confirmed against a real IPN connection test,
  and real orders are flowing (200+ rows: active + refunds + a chargeback, with
  status flipping correctly).
- **JVZoo** endpoint is wired and verifying, but no real JVZoo transaction has
  come through yet — that is the one remaining end-to-end check on that side.

## Live webhook URLs

- JVZoo: `https://api.onesupportcentre.com/webhooks/jvzoo`
- Digistore: `https://api.onesupportcentre.com/webhooks/digistore`

Browser check: add `/health` to either path. The bare path is POST-only (404 in a
browser by design).

## Env vars (Coolify)

- `JVZOO_IPN_SECRET`, `DIGISTORE_IPN_PASSPHRASE` — both required.

**Wiring gotcha:** a var must be BOTH referenced in `compose.coolify.yaml`'s
`x-app-env` AND set in the Coolify env UI, then redeploy. Setting it in the UI
alone does nothing (that block enumerates which vars reach each container). A
missing value returns `500 server_misconfigured`; `/health` does not read the
secrets, so a green health check does not confirm them.

## Signature verification (confirmed)

- **JVZoo `cverify`** (SHA-1): confirmed (matches Ashish's live receiver).
- **Digistore `sha_sign`** (SHA-512): confirmed against Digistore's official
  `sha_sign.php` and a live connection test. Default mode: drop `sha_sign`, sort
  keys as-is, **skip empty-valued fields**, `key=value<passphrase>`, uppercase
  hex. If a real IPN ever fails, `verifyDigistore` logs the signed field names.

## JVZoo API version — use v3

The IPN receiver is version-independent (it just verifies `cverify`). The version
choice matters for the two API calls we do NOT have yet: **historical backfill**
(the transactions endpoint) and **refund execution**.

- **Use v3.** It is JVZoo's current, actively-supported REST API; v2 / v2.1 are
  legacy. New integrations should target v3, and it carries the transactions +
  refund endpoints we need.
- **Revisit only** if a specific v2-only capability surfaces (none identified) —
  and document the reason here if so.
- Confirm the exact v3 endpoints, auth, and rate limits against JVZoo's current
  API docs when the backfill/refund integration is actually built (not wired yet;
  pending Ben's API keys).

## Per-ticket visibility (the "What the assistant did" trace)

- Every step shows a short reason: spam check, classification, the reply-branch
  gates ("why this path"), and the drafted reply.
- Lookups show their **request + response**: the Profit Dashboard access check
  shows the real `POST endpoint → status` with `req`/`res`; the purchase lookup
  (our DB) shows the query (`email = …, status = active`) and the rows returned —
  so an operator can tell a real "no order" from a lookup that could not run.
- The `/tickets` list filters by lookup outcome: **Found / Not found / Failed /
  Escalated** (via the `thread_tickets.lookup_outcome` view column). NOTE: this
  needs migration `20260707000001_thread_tickets_lookup_outcome.sql` applied to
  `dlwc` (see Migrations below).

## Go-live remaining

- **Backfill existing customers** — webhooks capture NEW sales only; a pre-go-live
  buyer reads as `not_found` (drafts a "no order found" reply for a human, does
  NOT auto-send). Load history from each platform's API (JVZoo v3 `transactions`,
  Digistore export) into `orders` — needs Ben's platform API keys. Or temporarily
  repoint the `not_found` edges of `order_lookup*` to `escalate` in `/flows` until
  backfill is done.
- **Refund execution keys** (Ben) — separate per-platform keys; for processing a
  refund at approval, not for the lookup.
- **ClickBank** — not wired (Ben: JVZoo + Digistore now, ClickBank later via its
  orders API).
- **JVZoo real test transaction** — the last end-to-end confirmation on that side.

## Migrations

- `20260706000001_orders.sql` — applied to `dlwc`.
- `20260707000001_thread_tickets_lookup_outcome.sql` — adds the `lookup_outcome`
  column to the `thread_tickets` view (for the ticket filter above). **Apply to
  `dlwc` via the Supabase MCP before merging/using the filter** (it was written
  while the MCP was disconnected). Regenerate types at a convenient point; the
  hand-edited `types.gen.ts` matches.

## Known limits

- **Out-of-order events**: a late SALE after a RFND would re-activate the order.
  Rare; add event-timestamp precedence if it matters.
- **Product mapping**: the lookup matches any active order for the email (Mobile
  Profits is the only brand on these accounts today). If an account later sells an
  unrelated brand, filter `orders` by product.

# Orders webhooks + purchase lookup — handoff

## What this does

Direct platform order webhooks (JVZoo + Digistore) write into our **own `orders`
table**, and the `purchase_lookup` flow step queries that table by email. This
replaces the stubbed platform-API lookups. Ben's call (2026-07): own the purchase
signal directly so a customer's order is still visible even if a third-party
pipeline (Profit Dashboard) breaks.

Profit Dashboard's email-lookup stays as the **access** check, unchanged. This
is only the **purchase** check.

## What's built (in this repo)

- **`orders` table** — migration `packages/db/supabase/migrations/20260706000001_orders.sql`
  (one row per platform order, unique `(platform, order_id)`; later refund /
  chargeback / cancel events flip `status`). Added to `packages/db/src/types.gen.ts`.
- **Receiver endpoints** — `apps/api/src/routes/orders-webhooks.ts`, with the
  verify / parse / upsert logic in `apps/api/src/lib/orders.ts`, mounted in
  `apps/api/src/app.ts`:
  - `POST /webhooks/jvzoo` — verifies JVZoo `cverify` (SHA-1), parses, upserts.
  - `POST /webhooks/digistore` — verifies `sha_sign` (see caveat), parses, upserts.
  - `GET /webhooks/jvzoo/health` + `/webhooks/digistore/health`.
- **`purchase_lookup`** (`apps/worker/src/lib/flow/nodes/purchase-lookup.ts`)
  queries the `orders` table by email: `found` = an active order exists,
  `not_found` = clean miss, `failed` = the query errored (escalate — it never
  claims "no purchase" when it could not actually check).
- **Tests** — `apps/api/src/lib/__tests__/orders.test.ts` and the updated
  `apps/worker/src/lib/flow/nodes/__tests__/purchase-access.test.ts`.

## Status (as of 2026-07-06)

- Code is **merged to main and deployed** (PR #93).
- The api is live at Coolify's auto-generated domain and the receivers respond:
  `GET /webhooks/jvzoo/health` and `/webhooks/digistore/health` both return
  `{"status":"ok"}`.
- The `orders` migration is **applied to `dlwc`** (the table exists, RLS on).
- NOT done yet: the IPN secrets in Coolify, Ashish registering the two URLs, and
  the backfill of existing customers. Until those, no real order gets saved.

## Webhook URLs to give Ashish

Ashish registers these in the JVZoo + Digistore dashboards for Mobile Profits.
The api service is live at Coolify's auto-generated domain (verified 2026-07-06):

- JVZoo: `https://ksumw9zy2vie63kwppczsa31.5.78.178.94.sslip.io/webhooks/jvzoo`
- Digistore: `https://ksumw9zy2vie63kwppczsa31.5.78.178.94.sslip.io/webhooks/digistore`

That sslip.io host is Coolify's auto-domain for the api service. If a custom
domain is set later, update the URLs in both dashboards to match. To check the
receiver from a browser, add `/health` to each path
(`.../webhooks/jvzoo/health` returns `{"status":"ok"}`); the bare path only
accepts POST and returns 404 in a browser by design.

## Env vars (set in Coolify)

- `JVZOO_IPN_SECRET` — the JVZoo IPN secret key.
- `DIGISTORE_IPN_PASSPHRASE` — the Digistore IPN passphrase.

Both are required; a POST returns 500 `server_misconfigured` if the secret is
unset (same as the AgentMail webhook). The `/health` endpoints do NOT read the
secrets, so "ok" there does not confirm the secrets are set.

## Go-live steps (remaining)

1. Migration: DONE 2026-07-06 (applied to `dlwc` via the Supabase MCP, the
   `orders` table exists). Regenerate types
   (`pnpm --filter @workspace/db gen-types`) at the next convenient point; the
   hand-edited `types.gen.ts` already matches, so it is not urgent.
2. Deploy: DONE (PR #93 merged, Coolify tracks main).
3. Set `JVZOO_IPN_SECRET` + `DIGISTORE_IPN_PASSPHRASE` in Coolify (from Ashish).
4. Ashish registers the two webhook URLs above and sends back the secrets.
5. **Backfill existing customers, before real traffic.** Webhooks only capture
   NEW sales from go-live, so a pre-go-live buyer reads as `not_found`. Important:
   `not_found` does NOT escalate. It routes to a "we can't find your order" reply
   draft (`reply_refund_no_order` for refund/chargeback, `reply_no_order` for
   login). Nothing auto-sends (a human approves every draft), but until backfill
   that draft is wrong for a real buyer. So either backfill first (load history
   from each platform's API — JVZoo v3 `transactions`, Digistore export — into
   `orders`, which needs the platform API keys from Ben), or temporarily repoint
   the `not_found` edges of the `order_lookup*` nodes to `escalate` in `/flows`
   until backfill is done. Only `failed` (a DB/API error) escalates today.
6. **Refund execution** — the per-platform refund keys (Ben) are separate; they
   are for actually processing a refund at approval, not for the lookup.
7. **Test** — fire a test sale from each platform (or a sandbox), confirm a row
   lands in `orders` and `purchase_lookup` returns `found` for that email.

## Confirm at go-live / known limits

- **Digistore `sha_sign`**: `verifyDigistore` in `orders.ts` implements the
  standard "sorted params + passphrase, SHA-512" scheme, but the EXACT
  concatenation must be confirmed against Digistore's current IPN docs + the
  dashboard passphrase before trusting it. It is isolated in one function, so it
  is a one-function fix if the format differs. JVZoo `cverify` is confirmed
  (matches Ashish's live receiver).
- **Out-of-order events**: a late SALE arriving after a RFND would re-activate the
  order. Rare; add event-timestamp precedence if it ever matters.
- **ClickBank**: not wired here. Ben: JVZoo + Digistore for Mobile Profits now,
  ClickBank later (via its orders API, which supports pulling by date).
- **Product mapping**: the lookup matches any active order for the email (Mobile
  Profits is the only product on these platforms today). If products later share
  these platforms, filter `orders` by product.

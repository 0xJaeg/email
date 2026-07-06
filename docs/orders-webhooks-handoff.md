# Orders webhooks + purchase lookup — handoff

## What this does

Direct platform order webhooks (JVZoo + Digistore) write into our **own `orders`
table**, and the `purchase_lookup` flow step queries that table by email. This
replaces the stubbed platform‑API lookups. Ben's call (2026‑07): own the purchase
signal directly so a customer's order is still visible even if a third‑party
pipeline (Profit Dashboard) breaks.

Profit Dashboard's email‑lookup stays as the **access** check — unchanged. This
is only the **purchase** check.

## What's built (in this repo)

- **`orders` table** — migration `packages/db/supabase/migrations/20260706000001_orders.sql`
  (one row per platform order, unique `(platform, order_id)`; later refund /
  chargeback / cancel events flip `status`). Added to `packages/db/src/types.gen.ts`.
- **Receiver endpoints** — `apps/api/src/routes/orders-webhooks.ts`, with the
  verify / parse / upsert logic in `apps/api/src/lib/orders.ts`, mounted in
  `apps/api/src/app.ts`:
  - `POST /webhooks/jvzoo` — verifies JVZoo `cverify` (SHA‑1), parses, upserts.
  - `POST /webhooks/digistore` — verifies `sha_sign` (see caveat), parses, upserts.
  - `GET /webhooks/jvzoo/health` + `/webhooks/digistore/health`.
- **`purchase_lookup`** (`apps/worker/src/lib/flow/nodes/purchase-lookup.ts`) now
  queries the `orders` table by email: `found` = an active order exists,
  `not_found` = clean miss, `failed` = the query errored (escalate — never claims
  "no purchase" when it couldn't check).
- **Tests** — `apps/api/src/lib/__tests__/orders.test.ts` and the updated
  `apps/worker/src/lib/flow/nodes/__tests__/purchase-access.test.ts`.

## Webhook URLs to give Ashish

Ashish registers these in the JVZoo + Digistore dashboards for Mobile Profits
(use the real api/hooks domain — Coolify routes `hooks.*` → the api app):

- JVZoo: `https://hooks.<domain>/webhooks/jvzoo`
- Digistore: `https://hooks.<domain>/webhooks/digistore`

## Env vars (set in Coolify)

- `JVZOO_IPN_SECRET` — the JVZoo IPN secret key.
- `DIGISTORE_IPN_PASSPHRASE` — the Digistore IPN passphrase.

Both are required; the endpoint returns 500 if unset (same as the AgentMail webhook).

## Go‑live steps (remaining)

1. Apply `20260706000001_orders.sql` to the live DB (`dlwc`) via the Supabase MCP,
   then regenerate types. (Not applied yet — the table is empty until the
   receivers are live, so it waits for the deploy.)
2. Deploy api + worker + web (merge to main; Coolify tracks main).
3. Set `JVZOO_IPN_SECRET` + `DIGISTORE_IPN_PASSPHRASE` in Coolify.
4. Ashish registers the two webhook URLs and sends back the secrets.
5. **Backfill existing customers.** Webhooks only capture NEW sales from go‑live,
   so existing buyers read as "not found" until backfilled. Load history from each
   platform's API (JVZoo v3 `transactions`, Digistore export) into the `orders`
   table — needs the platform API keys from Ben. Until backfilled, older customers
   just escalate to a human on refund/login (safe, not wrong).
6. **Refund execution** — the per‑platform refund keys (Ben) are separate; they're
   for actually processing a refund at approval, not for the lookup.
7. **Test** — fire a test sale from each platform (or a sandbox), confirm a row
   lands in `orders` and `purchase_lookup` returns `found` for that email.

## Confirm at go‑live / known limits

- **Digistore `sha_sign`**: `verifyDigistore` in `orders.ts` implements the
  standard "sorted params + passphrase, SHA‑512" scheme, but the EXACT
  concatenation must be confirmed against Digistore's current IPN docs + the
  dashboard passphrase before trusting it. It's isolated in one function — a
  one‑line fix if the format differs. JVZoo `cverify` is confirmed (matches
  Ashish's live receiver).
- **Out‑of‑order events**: a late SALE arriving after a RFND would re‑activate the
  order. Rare; add event‑timestamp precedence if it ever matters.
- **ClickBank**: not wired here. Ben: JVZoo + Digistore for Mobile Profits now,
  ClickBank later (via its orders API, which supports pulling by date).
- **Product mapping**: the lookup matches any active order for the email (Mobile
  Profits is the only product on these platforms today). If products later share
  these platforms, filter `orders` by product.

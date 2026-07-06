import { Hono } from "hono"
import type { Context } from "hono"
import { getSupabase } from "../lib/supabase.js"
import {
  verifyJvzoo,
  parseJvzoo,
  verifyDigistore,
  parseDigistore,
  recordOrder,
  type OrderInput,
} from "../lib/orders.js"

type Platform = {
  name: string
  secretEnv: string
  verify: (params: URLSearchParams, secret: string) => boolean
  parse: (params: URLSearchParams) => OrderInput | null
}

const JVZOO: Platform = {
  name: "jvzoo",
  secretEnv: "JVZOO_IPN_SECRET",
  verify: verifyJvzoo,
  parse: parseJvzoo,
}
const DIGISTORE: Platform = {
  name: "digistore",
  secretEnv: "DIGISTORE_IPN_PASSPHRASE",
  verify: verifyDigistore,
  parse: parseDigistore,
}

// Receive a platform order webhook: verify the signature, parse the payload into
// an order, and upsert it into our own orders table. Nothing customer-facing —
// it just keeps the orders store current so purchase_lookup can read it.
async function ingest(c: Context, p: Platform) {
  const supabase = getSupabase()
  const secret = process.env[p.secretEnv]
  if (!secret) {
    console.error(`[webhook] ${p.secretEnv} not configured`)
    return c.json({ error: "server_misconfigured" }, 500)
  }

  const params = new URLSearchParams(await c.req.text())

  if (!p.verify(params, secret)) {
    await supabase.from("audit_log").insert({
      action: "orders_webhook",
      status: "failure",
      error: "signature_verification_failed",
      payload: { platform: p.name },
    })
    return c.json({ error: "invalid_signature" }, 400)
  }

  const order = p.parse(params)
  if (!order) {
    // Not an order event we track (test / unknown) — ack so the platform doesn't retry.
    await supabase.from("audit_log").insert({
      action: "orders_webhook",
      status: "success",
      payload: { platform: p.name, ignored: true },
    })
    return c.json({ ok: true, status: "ignored" })
  }

  try {
    await recordOrder(supabase, order)
  } catch (err) {
    await supabase.from("audit_log").insert({
      action: "orders_webhook",
      status: "failure",
      error: err instanceof Error ? err.message : String(err),
      payload: { platform: p.name, order_id: order.order_id },
    })
    return c.json({ error: "db_error" }, 500)
  }

  await supabase.from("audit_log").insert({
    action: "orders_webhook",
    status: "success",
    payload: {
      platform: p.name,
      order_id: order.order_id,
      event: order.event_type,
      order_status: order.status,
    },
  })
  return c.json({ ok: true })
}

// Direct platform order webhooks -> our own orders table. Mounted under
// /webhooks, so the live URLs are /webhooks/jvzoo and /webhooks/digistore.
export const ordersWebhooksRoute = new Hono()
  .get("/jvzoo/health", (c) => c.json({ status: "ok" }))
  .post("/jvzoo", (c) => ingest(c, JVZOO))
  .get("/digistore/health", (c) => c.json({ status: "ok" }))
  .post("/digistore", (c) => ingest(c, DIGISTORE))

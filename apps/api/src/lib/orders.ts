import { createHash } from "node:crypto"
import type { ServerClient } from "@workspace/db/client"
import type { Json } from "@workspace/db/types"

// One order as we store it, fed by a platform webhook. status is derived from
// the platform's event type; a later refund/chargeback/cancel event flips it.
export type OrderStatus = "active" | "refunded" | "chargeback" | "cancelled"

export type OrderInput = {
  platform: string
  order_id: string
  email: string
  customer_name: string | null
  product_id: string | null
  product_name: string | null
  amount: number | null
  currency: string | null
  status: OrderStatus
  event_type: string | null
  purchased_at: string | null
  raw: Json
}

// ---------------------------------------------------------------------------
// JVZoo (application/x-www-form-urlencoded IPN)
// ---------------------------------------------------------------------------

// JVZoo IPN verification: SHA-1 of every value (in the order received, skipping
// cverify) each suffixed with '|', then the secret; first 8 hex chars, uppercased,
// compared to cverify. This is JVZoo's documented scheme (and matches Ashish's
// live receiver). Field ORDER matters, so callers must pass params parsed from
// the raw body (URLSearchParams preserves order).
export function verifyJvzoo(params: URLSearchParams, secret: string): boolean {
  const cverify = params.get("cverify")
  if (!cverify) return false
  let pop = ""
  for (const [key, value] of params.entries()) {
    if (key === "cverify") continue
    pop += value + "|"
  }
  pop += secret
  const calc = createHash("sha1")
    .update(pop)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase()
  return calc === cverify.toUpperCase()
}

// JVZoo ctransaction -> our status. Non-order events (TEST/INSF/unknown) return
// null so we don't store them.
export function jvzooStatus(ctransaction: string): OrderStatus | null {
  switch (ctransaction) {
    case "SALE":
    case "BILL":
      return "active"
    case "RFND":
      return "refunded"
    case "CGBK":
      return "chargeback"
    case "CANCEL-REBILL":
      return "cancelled"
    default:
      return null
  }
}

export function parseJvzoo(params: URLSearchParams): OrderInput | null {
  const status = jvzooStatus(params.get("ctransaction") ?? "")
  if (!status) return null
  const email = params.get("ccustemail") ?? ""
  const orderId = params.get("ctransreceipt") ?? ""
  if (!email || !orderId) return null
  const amount = params.get("ctransamount")
  return {
    platform: "jvzoo",
    order_id: orderId,
    email,
    customer_name: params.get("ccustname"),
    product_id: params.get("cproditem"),
    product_name: params.get("cprodtitle"),
    amount: amount ? Number(amount) : null,
    currency: params.get("ccurrency"),
    status,
    event_type: params.get("ctransaction"),
    purchased_at: null,
    raw: Object.fromEntries(params.entries()) as Json,
  }
}

// ---------------------------------------------------------------------------
// Digistore24 (application/x-www-form-urlencoded IPN)
// ---------------------------------------------------------------------------

// Digistore24 sha_sign verification.
// CONFIRM AT GO-LIVE: this implements the standard "sorted params + passphrase,
// SHA-512, uppercase" scheme, but the exact concatenation must be verified
// against Digistore's current IPN docs + the dashboard passphrase before trusting
// it in production. It is isolated here so it's a one-function fix if the format
// differs.
export function verifyDigistore(
  params: URLSearchParams,
  passphrase: string
): boolean {
  const sig = params.get("sha_sign")
  if (!sig) return false
  const keys = [...params.keys()].filter((k) => k !== "sha_sign").sort()
  let base = ""
  for (const k of keys) base += `${k}=${params.get(k) ?? ""}${passphrase}`
  const calc = createHash("sha512").update(base).digest("hex").toUpperCase()
  return calc === sig.toUpperCase()
}

export function digistoreStatus(event: string): OrderStatus | null {
  const e = event.toLowerCase()
  if (e.includes("refund")) return "refunded"
  if (e.includes("chargeback")) return "chargeback"
  if (e.includes("cancel")) return "cancelled"
  if (e.includes("payment") || e.includes("rebill")) return "active"
  return null
}

export function parseDigistore(params: URLSearchParams): OrderInput | null {
  const event = params.get("event") ?? params.get("action") ?? ""
  const status = digistoreStatus(event)
  if (!status) return null
  const email = params.get("email") ?? params.get("buyer_email") ?? ""
  const orderId =
    params.get("order_id") ??
    params.get("txn_id") ??
    params.get("payment_id") ??
    ""
  if (!email || !orderId) return null
  const name = [params.get("buyer_first_name"), params.get("buyer_last_name")]
    .filter(Boolean)
    .join(" ")
  const amount = params.get("amount")
  return {
    platform: "digistore",
    order_id: orderId,
    email,
    customer_name: name || null,
    product_id: params.get("product_id"),
    product_name: params.get("product_name"),
    amount: amount ? Number(amount) : null,
    currency: params.get("currency"),
    status,
    event_type: event,
    purchased_at: null,
    raw: Object.fromEntries(params.entries()) as Json,
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

// Sale/rebill create-or-refresh the order row; refund/chargeback/cancel only flip
// the status on the existing row (so a refund payload doesn't clobber the sale's
// details), inserting a stub if we never saw the original sale. NOTE: events can
// arrive out of order — a late SALE after a RFND would re-activate it; acceptable
// for v1, documented in the handoff.
export async function recordOrder(
  supabase: ServerClient,
  o: OrderInput
): Promise<void> {
  const email = o.email.trim().toLowerCase()
  const now = new Date().toISOString()

  if (o.status === "active") {
    const { error } = await supabase
      .from("orders")
      .upsert(
        { ...o, email, updated_at: now },
        { onConflict: "platform,order_id" }
      )
    if (error) throw new Error(`orders upsert failed: ${error.message}`)
    return
  }

  const { data, error } = await supabase
    .from("orders")
    .update({ status: o.status, event_type: o.event_type, updated_at: now })
    .eq("platform", o.platform)
    .eq("order_id", o.order_id)
    .select("id")
  if (error) throw new Error(`orders status update failed: ${error.message}`)
  if (!data || data.length === 0) {
    const { error: insErr } = await supabase
      .from("orders")
      .insert({ ...o, email, updated_at: now })
    if (insErr) throw new Error(`orders insert failed: ${insErr.message}`)
  }
}

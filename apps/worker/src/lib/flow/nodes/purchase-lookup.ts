import type { Order } from "@workspace/actions"
import { normalizeEmailAddress } from "../../email-address.js"
import {
  okLookup,
  errLookup,
  purchaseLine,
  type LookupRecord,
} from "../../customer-context.js"
import type { NodeType, StepContext } from "../types.js"

// Purchase lookup: search OUR OWN orders table (fed by the platform webhooks —
// JVZoo, Digistore, ...) for an active purchase under the sender's email. This
// is the FIRST step for every purchase-dependent ticket (login/access, refund,
// chargeback). Profit Dashboard is an ACCESS check, not a purchase check, so it
// is NOT consulted here.
//
// Outcomes:
//   failed    — the orders query errored (DB down) → escalate. We never claim
//               "no purchase" when we could not actually check.
//   found     — an active order exists for this email.
//   not_found — the query ran cleanly and found no active order.
export const PurchaseLookupNode: NodeType = {
  type: "purchase_lookup",
  async run(ctx) {
    const email = normalizeEmailAddress(ctx.email.from_email)

    let orders: Order[]
    try {
      orders = await lookupActiveOrders(ctx.supabase, email)
    } catch (err) {
      return withLookup(
        ctx,
        "failed",
        [],
        errLookup("orders_db", "order_lookup", err)
      )
    }

    return withLookup(
      ctx,
      orders.length > 0 ? "found" : "not_found",
      orders,
      okLookup(
        "orders_db",
        "order_lookup",
        orders.length > 0
          ? `${orders.length} order(s) found`
          : "no matching order"
      )
    )
  },
}

// Read this email's active (non-refunded/chargeback/cancelled) orders from our
// own table and map them to the shared Order shape the reply/trace use.
async function lookupActiveOrders(
  supabase: StepContext["supabase"],
  email: string
): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("order_id, product_name, product_id, amount, currency, purchased_at")
    .eq("email", email)
    .eq("status", "active")
  if (error) throw new Error(error.message)
  return (data ?? []).map((o) => ({
    orderId: o.order_id,
    productName: o.product_name ?? o.product_id ?? "the product",
    amount: Number(o.amount ?? 0),
    currency: o.currency ?? "",
    purchasedAt: o.purchased_at ?? "",
  }))
}

// Merge this lookup into ctx.enrichment (preserving any prior access result +
// lookups) and return the node result.
function withLookup(
  ctx: StepContext,
  outcome: string,
  orders: Order[],
  record: LookupRecord
) {
  const prev = ctx.enrichment?.context
  return {
    outcome,
    enrichment: {
      context: {
        orders,
        access: prev?.access ?? { hasAccess: false, details: null },
        lookups: [...(prev?.lookups ?? []), record],
      },
      customerContext: purchaseLine(orders),
    },
  }
}

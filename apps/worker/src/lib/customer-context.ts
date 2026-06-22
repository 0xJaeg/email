import type { ProductAdapter, Order, AccessResult } from "@workspace/actions"

// One external API call the lookup made, captured for the per-ticket trace so an
// operator can SEE what happened behind the scenes — including a down/erroring
// endpoint, which is otherwise indistinguishable from a genuine "not found".
export type LookupRecord = {
  adapter: string // adapter key, e.g. "profitdashboard"
  operation: "order_lookup" | "access_check"
  ok: boolean // false = the call threw (endpoint down / auth failed / timeout)
  summary: string // outcome on success; the error message on failure
}

export type GatheredContext = {
  // Stored on decisions.context (jsonb) for the dashboard + audit.
  context: { orders: Order[]; access: AccessResult; lookups: LookupRecord[] }
  // Rendered block fed to the reply model as verified customer context.
  customerContext: string
}

// Runs the read-only enrichment actions (lookupOrder + checkAccess) for an
// existing-member email and renders a concise, factual context block. Each call
// is captured into `lookups` (success or error) so the trace shows exactly which
// APIs ran and how they answered — a thrown call is recorded, not swallowed.
// Never invents details — the reply model is told to use only what's here.
export async function gatherCustomerContext(
  adapter: ProductAdapter,
  email: { from_email: string },
  expectedProductKey?: string | null
): Promise<GatheredContext> {
  const lookups: LookupRecord[] = []

  let lookup: OrderLookupShape = { found: false, orders: [] }
  try {
    lookup = await adapter.lookupOrder({ email: email.from_email })
    lookups.push({
      adapter: adapter.key,
      operation: "order_lookup",
      ok: true,
      summary: lookup.found
        ? `${lookup.orders.length} order(s) found`
        : "no matching order",
    })
  } catch (err) {
    lookups.push({
      adapter: adapter.key,
      operation: "order_lookup",
      ok: false,
      summary: err instanceof Error ? err.message : String(err),
    })
  }

  const order = lookup.orders[0] ?? null
  let access: AccessResult = { hasAccess: false, details: null }
  try {
    access = await adapter.checkAccess({
      email: email.from_email,
      order,
      expectedProductKey,
    })
    lookups.push({
      adapter: adapter.key,
      operation: "access_check",
      ok: true,
      summary: access.hasAccess ? "access active" : "no access",
    })
  } catch (err) {
    lookups.push({
      adapter: adapter.key,
      operation: "access_check",
      ok: false,
      summary: err instanceof Error ? err.message : String(err),
    })
  }

  const lines: string[] = []
  if (lookup.found && order) {
    lines.push(
      `- Purchase: ${order.productName}, order ${order.orderId}, ${order.amount} ${order.currency}, purchased ${order.purchasedAt}.`
    )
  } else {
    lines.push("- No purchase found for this email address.")
  }
  if (access.hasAccess) {
    lines.push(`- Account access: active. ${access.details ?? ""}`.trim())
  } else {
    lines.push(
      "- Account access: NOT found — they may not have been granted access. Offer to investigate / resend access details."
    )
  }

  return {
    context: { orders: lookup.orders, access, lookups },
    customerContext: lines.join("\n"),
  }
}

type OrderLookupShape = { found: boolean; orders: Order[] }

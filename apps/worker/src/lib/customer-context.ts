import type {
  ProductAdapter,
  Order,
  AccessResult,
  OrderLookupResult,
  HttpCallInfo,
} from "@workspace/actions"

// One external API call the lookup made, captured for the per-ticket trace so an
// operator can SEE what happened behind the scenes — including a down/erroring
// endpoint, which is otherwise indistinguishable from a genuine "not found".
export type LookupRecord = {
  adapter: string // adapter key, e.g. "profitdashboard", "mailwizz"
  operation: "order_lookup" | "access_check" | "unsubscribe" | "add_user"
  ok: boolean // false = the call threw (endpoint down / auth failed / timeout)
  summary: string // outcome on success; the error message on failure
  endpoint?: string // the HTTP endpoint hit, when the adapter made a real call
  method?: string
  status?: number | null // HTTP status code
  request?: string // PII-light summary of the request we sent
  response?: string // PII-light summary of the response we got
}

export type GatheredContext = {
  // Stored on decisions.context (jsonb) for the dashboard + audit.
  context: { orders: Order[]; access: AccessResult; lookups: LookupRecord[] }
  // Rendered block fed to the reply model as verified customer context.
  customerContext: string
}

// LookupRecord builders — the single source of truth for the PII-light summaries
// shared by gatherCustomerContext and the purchase / access / add-user flow nodes,
// so the trace reads identically wherever a lookup happens.
export function okLookup(
  adapter: string,
  operation: LookupRecord["operation"],
  summary: string,
  http?: Partial<HttpCallInfo>
): LookupRecord {
  return { adapter, operation, ok: true, summary, ...(http ?? {}) }
}

export function errLookup(
  adapter: string,
  operation: LookupRecord["operation"],
  err: unknown,
  http?: Partial<HttpCallInfo>
): LookupRecord {
  return {
    adapter,
    operation,
    ok: false,
    summary: err instanceof Error ? err.message : String(err),
    ...(http ?? {}),
  }
}

// The customerContext lines, kept here so every step renders the purchase / access
// facts identically (the reply model is told to use ONLY what's here, never invent).
export function purchaseLine(orders: Order[]): string {
  const order = orders[0]
  return order
    ? `- Purchase: ${order.productName}, order ${order.orderId}, ${order.amount} ${order.currency}, purchased ${order.purchasedAt}.`
    : "- No purchase found for this email address."
}

export function accessLine(access: AccessResult): string {
  return access.hasAccess
    ? `- Account access: active. ${access.details ?? ""}`.trim()
    : "- Account access: NOT found — they may not have been granted access. Offer to investigate / resend access details."
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

  let lookup: OrderLookupResult = { found: false, orders: [] }
  try {
    lookup = await adapter.lookupOrder({ email: email.from_email })
    lookups.push(
      okLookup(
        adapter.key,
        "order_lookup",
        lookup.found
          ? `${lookup.orders.length} order(s) found`
          : "no matching order",
        lookup.http
      )
    )
  } catch (err) {
    lookups.push(errLookup(adapter.key, "order_lookup", err))
  }

  const order = lookup.orders[0] ?? null
  let access: AccessResult = { hasAccess: false, details: null }
  try {
    access = await adapter.checkAccess({
      email: email.from_email,
      order,
      expectedProductKey,
    })
    lookups.push(
      okLookup(
        adapter.key,
        "access_check",
        access.hasAccess ? "access active" : "no access",
        access.http
      )
    )
  } catch (err) {
    lookups.push(errLookup(adapter.key, "access_check", err))
  }

  return {
    context: { orders: lookup.orders, access, lookups },
    customerContext: [purchaseLine(lookup.orders), accessLine(access)].join(
      "\n"
    ),
  }
}

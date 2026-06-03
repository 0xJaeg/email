import type { ProductAdapter, Order, AccessResult } from "@workspace/actions"

export type GatheredContext = {
  // Stored on decisions.context (jsonb) for the dashboard + audit.
  context: { orders: Order[]; access: AccessResult }
  // Rendered block fed to the reply model as verified customer context.
  customerContext: string
}

// Runs the read-only enrichment actions (lookupOrder + checkAccess) for an
// existing-member email and renders a concise, factual context block. Never
// invents details — the reply model is told to use only what's here.
export async function gatherCustomerContext(
  adapter: ProductAdapter,
  email: { from_email: string }
): Promise<GatheredContext> {
  const lookup = await adapter.lookupOrder({ email: email.from_email })
  const order = lookup.orders[0] ?? null
  const access = await adapter.checkAccess({ email: email.from_email, order })

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
    context: { orders: lookup.orders, access },
    customerContext: lines.join("\n"),
  }
}

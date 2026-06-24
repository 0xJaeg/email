import { getAdapter } from "@workspace/actions"
import type { Order } from "@workspace/actions"
import { normalizeEmailAddress } from "../../email-address.js"
import {
  okLookup,
  errLookup,
  purchaseLine,
  type LookupRecord,
} from "../../customer-context.js"
import type { NodeType } from "../types.js"

const DEFAULT_PLATFORMS = ["clickbank", "jvzoo", "digistore"]

// Purchase lookup: search the selling platforms (ClickBank / JVZoo / Digistore)
// for a purchase under the sender's email. This is the FIRST step for every
// purchase-dependent ticket (login/access, refund, chargeback). Profit Dashboard
// is an ACCESS check, not a purchase check, so it is NOT consulted here.
//
// Read-only (lookupOrder only). Each platform records a LookupRecord (in a fixed
// order, for a stable trace). Outcomes:
//   failed    — every platform either threw OR is a credential-pending stub, so
//               we could not actually check → escalate to a human. We never claim
//               "no purchase" when the APIs simply could not run (the distinction
//               Ben asked for: a down/unconfigured API must assign to a person).
//   found     — at least one platform returned an order.
//   not_found — at least one platform answered cleanly, none had a purchase.
export const PurchaseLookupNode: NodeType = {
  type: "purchase_lookup",
  async run(ctx, node) {
    const email = normalizeEmailAddress(ctx.email.from_email)
    const platforms =
      (node.config.platforms as string[] | undefined) ?? DEFAULT_PLATFORMS

    const settled = await Promise.allSettled(
      platforms.map((p) => getAdapter(p).lookupOrder({ email }))
    )

    const lookups: LookupRecord[] = []
    const orders: Order[] = []
    let anyTrustworthy = false // a platform gave a real answer (configured, no throw)
    platforms.forEach((p, i) => {
      const r = settled[i]!
      if (r.status === "rejected") {
        lookups.push(errLookup(p, "order_lookup", r.reason))
        return
      }
      const res = r.value
      if (res.configured === false) {
        // Credential-pending stub — not an answer we can trust.
        lookups.push({
          adapter: p,
          operation: "order_lookup",
          ok: false,
          summary: "not configured (pending API credentials)",
        })
        return
      }
      anyTrustworthy = true
      orders.push(...res.orders)
      lookups.push(
        okLookup(
          p,
          "order_lookup",
          res.found
            ? `${res.orders.length} order(s) found`
            : "no matching order",
          res.http
        )
      )
    })

    const outcome = !anyTrustworthy
      ? "failed"
      : orders.length > 0
        ? "found"
        : "not_found"

    const prev = ctx.enrichment?.context
    return {
      outcome,
      enrichment: {
        context: {
          orders,
          access: prev?.access ?? { hasAccess: false, details: null },
          lookups: [...(prev?.lookups ?? []), ...lookups],
        },
        // Purchase facts only — the access line is appended by access_check when
        // it runs (refund/chargeback never run it, so their reply isn't polluted
        // with a misleading "access NOT found" line).
        customerContext: purchaseLine(orders),
      },
    }
  },
}

import { getAdapter } from "@workspace/actions"
import type { AccessResult } from "@workspace/actions"
import { normalizeEmailAddress } from "../../email-address.js"
import {
  okLookup,
  errLookup,
  accessLine,
  type LookupRecord,
} from "../../customer-context.js"
import type { NodeType } from "../types.js"

// Access check: query the product's access adapter (Profit Dashboard) for active
// membership — runs ONLY after purchase_lookup confirmed a purchase. Passes the
// found order + the product's expected access_product_key so a member of a
// DIFFERENT product isn't wrongly granted access (matches EnrichStep). Read-only.
// Outcomes:
//   failed     — no routed product/adapter, or the access API threw → escalate.
//   has_access — active access → send login details.
//   no_access  — purchased but not in the dashboard → add them, then send login.
export const AccessCheckNode: NodeType = {
  type: "access_check",
  async run(ctx) {
    const prev = ctx.enrichment?.context
    const orders = prev?.orders ?? []
    const baseContext = ctx.enrichment?.customerContext ?? ""
    const adapterKey = ctx.product?.adapterKey

    let access: AccessResult = { hasAccess: false, details: null }
    let lookup: LookupRecord
    let outcome: string

    if (!adapterKey) {
      outcome = "failed"
      lookup = {
        adapter: "access",
        operation: "access_check",
        ok: false,
        summary: "no access adapter configured for this product",
      }
    } else {
      const email = normalizeEmailAddress(ctx.email.from_email)
      const expectedProductKey =
        (ctx.product?.supportConfig as { access_product_key?: string } | null)
          ?.access_product_key ?? null
      try {
        access = await getAdapter(adapterKey).checkAccess({
          email,
          order: orders[0] ?? null,
          expectedProductKey,
        })
        outcome = access.hasAccess ? "has_access" : "no_access"
        lookup = okLookup(
          adapterKey,
          "access_check",
          access.hasAccess ? "access active" : "no access",
          access.http
        )
      } catch (err) {
        outcome = "failed"
        lookup = errLookup(adapterKey, "access_check", err)
      }
    }

    return {
      outcome,
      enrichment: {
        context: {
          orders,
          access,
          lookups: [...(prev?.lookups ?? []), lookup],
        },
        // Append the access line only on a real determination; a failed check
        // routes to escalate and shouldn't claim "access NOT found".
        customerContext:
          outcome === "failed"
            ? baseContext
            : [baseContext, accessLine(access)].filter(Boolean).join("\n"),
      },
    }
  },
}

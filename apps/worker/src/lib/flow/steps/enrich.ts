import { getAdapter } from "@workspace/actions"
import { gatherCustomerContext } from "../../customer-context.js"
import type { Step } from "../types.js"

// Step: for existing members with a routed product, look up purchase + access
// and audit it. Gated — prospective buyers / un-routed threads skip enrichment.
export const EnrichStep: Step = {
  key: "enrich",
  async run(ctx) {
    const { classification, product, email, supabase } = ctx
    if (
      classification?.inquiry_type !== "existing_member" ||
      !product?.adapterKey
    ) {
      return { enrichment: null }
    }
    try {
      const enrichment = await gatherCustomerContext(
        getAdapter(product.adapterKey),
        email
      )
      await supabase.from("audit_log").insert({
        action: "gather_context",
        email_id: email.id,
        status: "success",
        payload: {
          found: enrichment.context.orders.length > 0,
          order_count: enrichment.context.orders.length,
          has_access: enrichment.context.access.hasAccess,
        },
      })
      return { enrichment }
    } catch (err) {
      await supabase.from("audit_log").insert({
        action: "gather_context",
        email_id: email.id,
        status: "failure",
        error: err instanceof Error ? err.message : String(err),
      })
      return { enrichment: null }
    }
  },
}

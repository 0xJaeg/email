import { getAdapter } from "@workspace/actions"
import { gatherCustomerContext } from "../../customer-context.js"
import type { Step } from "../types.js"

// Step: for existing members with a routed product, look up purchase + access
// and audit it. Gated — prospective buyers / un-routed threads skip enrichment.
export const EnrichStep: Step = {
  key: "enrich",
  async run(ctx) {
    const { product, email, supabase } = ctx
    // Enrich only when a lookup node explicitly asked for it (order_lookup /
    // purchase_lookup set needsLookup). No implicit gate.
    const wantLookup = ctx.needsLookup === true
    if (!wantLookup || !product?.adapterKey) {
      return { enrichment: null }
    }
    try {
      // The provider product key this product expects (set on the product's
      // support_config) — gates access for multi-product lookup adapters.
      const expectedProductKey =
        (product.supportConfig as { access_product_key?: string } | null)
          ?.access_product_key ?? null
      const enrichment = await gatherCustomerContext(
        getAdapter(product.adapterKey),
        email,
        expectedProductKey
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

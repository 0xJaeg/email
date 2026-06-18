import { EnrichStep } from "../steps/enrich.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

// Reaching this node means a lookup is wanted (the gate is now structural — only
// branches that need it route here), so force the lookup and reuse EnrichStep's
// adapter call + audit. Emits found / not_found to drive the next branch.
// "Found" means we identified the customer by EITHER a purchase or active
// access — access-only adapters (e.g. profitdashboard membership) have no order
// data but still confirm the customer.
export const OrderLookupNode: NodeType = {
  type: "order_lookup",
  async run(ctx, node) {
    ctx.needsLookup = true
    const patch = await EnrichStep.run(ctx, toStepConfig(node))
    const ctxData = patch.enrichment?.context
    const found =
      !!ctxData &&
      (ctxData.orders.length > 0 || ctxData.access?.hasAccess === true)
    return { ...patch, outcome: found ? "found" : "not_found" }
  },
}

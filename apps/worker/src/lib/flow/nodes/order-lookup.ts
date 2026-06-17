import { EnrichStep } from "../steps/enrich.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

// Reaching this node means a lookup is wanted (the gate is now structural — only
// branches that need it route here), so force the lookup and reuse EnrichStep's
// adapter call + audit. Emits found / not_found to drive the next branch.
export const OrderLookupNode: NodeType = {
  type: "order_lookup",
  async run(ctx, node) {
    ctx.needsLookup = true
    const patch = await EnrichStep.run(ctx, toStepConfig(node))
    const found =
      !!patch.enrichment && patch.enrichment.context.orders.length > 0
    return { ...patch, outcome: found ? "found" : "not_found" }
  },
}

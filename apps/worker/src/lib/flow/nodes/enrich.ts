import { EnrichStep } from "../steps/enrich.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

// Looks up purchase/access for existing members (gated). Routes onward via 'default'.
export const EnrichNode: NodeType = {
  type: "enrich",
  async run(ctx, node) {
    const patch = await EnrichStep.run(ctx, toStepConfig(node))
    return { ...patch, outcome: "default" }
  },
}

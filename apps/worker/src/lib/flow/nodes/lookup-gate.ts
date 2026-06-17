import { LookupGateStep } from "../steps/lookup-gate.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

// Sets ctx.needsLookup (consumed by the enrich node). Routes onward via 'default'.
export const LookupGateNode: NodeType = {
  type: "lookup_gate",
  async run(ctx, node) {
    const patch = await LookupGateStep.run(ctx, toStepConfig(node))
    return { ...patch, outcome: "default" }
  },
}

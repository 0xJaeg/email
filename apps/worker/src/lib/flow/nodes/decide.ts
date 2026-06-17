import { DecideStep } from "../steps/decide.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

// Outcome = the chosen decision; Phase 1's seeded tree routes all to draft via
// the 'default' edge.
export const DecideNode: NodeType = {
  type: "decide",
  async run(ctx, node) {
    const patch = await DecideStep.run(ctx, toStepConfig(node))
    return { ...patch, outcome: patch.decision?.decision ?? "default" }
  },
}

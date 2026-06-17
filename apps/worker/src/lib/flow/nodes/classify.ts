import { ClassifyStep } from "../steps/classify.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

// Outcome = the classification label, so later phases can branch by category.
// Phase 1's seeded tree has only a 'default' edge, so all labels route onward.
export const ClassifyNode: NodeType = {
  type: "classify",
  async run(ctx, node) {
    const patch = await ClassifyStep.run(ctx, toStepConfig(node))
    return { ...patch, outcome: patch.classification?.classification ?? "default" }
  },
}

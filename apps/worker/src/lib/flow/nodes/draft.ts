import { DraftStep } from "../steps/draft.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

// Terminal: persists the decision + drafts/escalates (queues for approval; never
// sends). No outgoing edge.
export const DraftNode: NodeType = {
  type: "draft",
  async run(ctx, node) {
    const patch = await DraftStep.run(ctx, toStepConfig(node))
    return { ...patch, outcome: "done" }
  },
}

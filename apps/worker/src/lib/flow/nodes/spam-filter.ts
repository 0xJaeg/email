import { SpamFilterStep } from "../steps/spam-filter.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

// Reuses SpamFilterStep verbatim (it inserts the quarantine decision + halts on
// spam). Outcome: 'spam' when it halted, else 'not_spam'.
export const SpamFilterNode: NodeType = {
  type: "spam_filter",
  async run(ctx, node) {
    const patch = await SpamFilterStep.run(ctx, toStepConfig(node))
    return { ...patch, outcome: patch.halt ? "spam" : "not_spam" }
  },
}

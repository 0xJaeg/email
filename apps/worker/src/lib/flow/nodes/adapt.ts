import type { FlowNode, FlowStepConfig } from "../types.js"

// Existing steps read FlowStepConfig (ai_prompt + condition). Map a node onto it
// so the wrappers can call the unchanged, tested step logic.
export function toStepConfig(node: FlowNode): FlowStepConfig {
  return {
    step_key: node.node_type,
    position: 0,
    ai_prompt: node.ai_prompt,
    condition: node.config,
  }
}

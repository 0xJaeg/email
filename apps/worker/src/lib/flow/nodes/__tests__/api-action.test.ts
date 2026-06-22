import { describe, it, expect } from "vitest"
import { ApiActionNode } from "../api-action.js"
import type { FlowNode, StepContext } from "../../types.js"

const node = (config: Record<string, unknown>): FlowNode => ({
  id: "n",
  node_key: "k",
  node_type: "api_action",
  ai_prompt: null,
  model: null,
  config,
})

describe("ApiActionNode", () => {
  it("emits default_outcome when set", async () => {
    const r = await ApiActionNode.run(
      {} as StepContext,
      node({ outcomes: ["refunded", "failed", "not_found"], default_outcome: "refunded" })
    )
    expect(r.outcome).toBe("refunded")
  })

  it("falls back to the first outcome when no default is set", async () => {
    const r = await ApiActionNode.run(
      {} as StepContext,
      node({ outcomes: ["success", "email_not_found", "failed"] })
    )
    expect(r.outcome).toBe("success")
  })

  it("emits 'default' when no outcomes are configured", async () => {
    const r = await ApiActionNode.run({} as StepContext, node({}))
    expect(r.outcome).toBe("default")
  })
})

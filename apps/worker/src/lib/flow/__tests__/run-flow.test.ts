import { describe, it, expect } from "vitest"
import { runFlow } from "../run-flow.js"
import type { Step, StepContext, FlowStepConfig } from "../types.js"

const cfg = (k: string, p: number): FlowStepConfig => ({
  step_key: k,
  position: p,
  ai_prompt: null,
  condition: {},
})

describe("runFlow", () => {
  it("runs steps in position order, threading the accumulated context", async () => {
    const calls: string[] = []
    const a: Step = {
      key: "a",
      run: async () => {
        calls.push("a")
        return { productFacts: "x" }
      },
    }
    const b: Step = {
      key: "b",
      run: async (ctx) => {
        calls.push("b")
        return { decisionId: ctx.productFacts ?? "" }
      },
    }
    const ctx = {} as StepContext
    const out = await runFlow([cfg("b", 2), cfg("a", 1)], { a, b }, ctx)
    expect(calls).toEqual(["a", "b"])
    expect(out.decisionId).toBe("x")
  })

  it("halts early when a step returns halt", async () => {
    const calls: string[] = []
    const a: Step = {
      key: "a",
      run: async () => {
        calls.push("a")
        return { halt: true }
      },
    }
    const b: Step = {
      key: "b",
      run: async () => {
        calls.push("b")
        return {}
      },
    }
    await runFlow([cfg("a", 1), cfg("b", 2)], { a, b }, {} as StepContext)
    expect(calls).toEqual(["a"])
  })

  it("skips unknown step_keys (forward-compatible)", async () => {
    const calls: string[] = []
    const a: Step = {
      key: "a",
      run: async () => {
        calls.push("a")
        return {}
      },
    }
    await runFlow([cfg("ghost", 1), cfg("a", 2)], { a }, {} as StepContext)
    expect(calls).toEqual(["a"])
  })
})

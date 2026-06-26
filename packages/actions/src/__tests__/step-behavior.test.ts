import { describe, it, expect } from "vitest"
import { STEP_BEHAVIOR, behaviorKeyFor } from "../step-behavior.js"

describe("STEP_BEHAVIOR", () => {
  for (const [key, b] of Object.entries(STEP_BEHAVIOR)) {
    it(`${key} is well-formed`, () => {
      expect(b.summary).toBeTruthy()
      expect(b.steps.length).toBeGreaterThan(0)
      for (const s of b.steps) expect(s).toBeTruthy()
      for (const n of b.notes ?? []) expect(n).toBeTruthy()
    })
  }
})

describe("behaviorKeyFor", () => {
  it("resolves send_reply by its decision", () => {
    expect(behaviorKeyFor("send_reply", { decision: "escalate" })).toBe(
      "escalate"
    )
    expect(behaviorKeyFor("send_reply", { decision: "send_faq_reply" })).toBe(
      "reply"
    )
    expect(behaviorKeyFor("send_reply", {})).toBe("reply")
  })

  it("maps draft to the reply behavior", () => {
    expect(behaviorKeyFor("draft", {})).toBe("reply")
  })

  it("maps known action node types to themselves", () => {
    expect(behaviorKeyFor("refund_ladder", {})).toBe("refund_ladder")
    expect(behaviorKeyFor("spam_filter", {})).toBe("spam_filter")
    expect(behaviorKeyFor("classify", {})).toBe("classify")
  })

  it("returns null for API / unknown node types", () => {
    expect(behaviorKeyFor("purchase_lookup", {})).toBeNull()
    expect(behaviorKeyFor("nonsense", {})).toBeNull()
    expect(behaviorKeyFor("send_reply", null)).toBe("reply")
  })

  it("every resolvable key exists in STEP_BEHAVIOR", () => {
    for (const k of ["escalate", "reply", "refund_ladder", "spam_filter", "classify", "decide"]) {
      expect(STEP_BEHAVIOR[k]).toBeDefined()
    }
  })
})

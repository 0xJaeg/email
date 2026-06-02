import { describe, it, expect } from "vitest"
import { INSTRUCTIONS_TEXT, REPLY_INSTRUCTIONS_TEXT } from "../instructions.js"

// The reply prompt must NOT inherit the classifier's identity or its internal
// dev/architecture vocabulary — that bleed is what made the agent reply to a
// customer with classification JSON and "I'm the classifier (slice C)" prose.
describe("REPLY_INSTRUCTIONS_TEXT (customer-facing reply prompt)", () => {
  it("establishes a support-agent identity, not the classifier identity", () => {
    expect(REPLY_INSTRUCTIONS_TEXT).toMatch(/customer-support agent/i)
    expect(REPLY_INSTRUCTIONS_TEXT).not.toMatch(/your job is to classify/i)
  })

  it("excludes the classification rubric, JSON output format, and internal slice vocabulary", () => {
    expect(REPLY_INSTRUCTIONS_TEXT).not.toMatch(/```json/)
    expect(REPLY_INSTRUCTIONS_TEXT).not.toMatch(/"classification":/)
    expect(REPLY_INSTRUCTIONS_TEXT).not.toMatch(/\bslice [A-Z]\b/)
    expect(REPLY_INSTRUCTIONS_TEXT).not.toMatch(
      /should remember from this file/i
    )
  })

  it("still carries the brand voice and refund policy the agent needs to write", () => {
    expect(REPLY_INSTRUCTIONS_TEXT).toMatch(/60-day money-back guarantee/i)
    expect(REPLY_INSTRUCTIONS_TEXT).toMatch(/Lead with the action/i)
  })
})

// The classifier prompt is unchanged in scope — it still has its rubric.
describe("INSTRUCTIONS_TEXT (classifier prompt)", () => {
  it("still contains the rubric and JSON output format", () => {
    expect(INSTRUCTIONS_TEXT).toMatch(/classify/i)
    expect(INSTRUCTIONS_TEXT).toMatch(/"classification":/)
  })
})

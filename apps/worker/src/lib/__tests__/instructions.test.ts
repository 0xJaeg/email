import { describe, it, expect } from "vitest"
import { assembleInstructions } from "../instructions.js"

// Representative prompt_configs rows (mirroring the seeded markdown).
const configs = [
  {
    kind: "classifier",
    content:
      'Classify the email into one label.\n\n```json\n{ "classification": "faq" }\n```\n\n## What the classifier should remember from this file\n- internal-only note',
  },
  {
    kind: "policy_refund",
    content:
      "We offer a 60-day money-back guarantee.\n\n## What the classifier should remember from this file\n- refund regex hint",
  },
  { kind: "tone", content: "Lead with the action. Be warm and concise." },
  { kind: "policy_faq", content: "How to download after purchase: ..." },
  { kind: "overview", content: "About the business." },
]

const { classifier, reply } = assembleInstructions(configs)

// The reply prompt must NOT inherit the classifier's identity or its internal
// dev/architecture vocabulary — that bleed is what made the agent reply to a
// customer with classification JSON and "I'm the classifier" prose.
describe("assembleInstructions — reply prompt (customer-facing)", () => {
  it("establishes a support-agent identity, not the classifier identity", () => {
    expect(reply).toMatch(/customer-support agent/i)
    expect(reply).not.toMatch(/your job is to classify/i)
  })

  it("excludes the classifier rubric and JSON output format", () => {
    expect(reply).not.toMatch(/```json/)
    expect(reply).not.toMatch(/"classification":/)
  })

  it("strips classifier-only 'what to remember' sections from reply-eligible content", () => {
    expect(reply).not.toMatch(/should remember from this file/i)
  })

  it("still carries the brand voice and refund policy the agent needs", () => {
    expect(reply).toMatch(/60-day money-back guarantee/i)
    expect(reply).toMatch(/Lead with the action/i)
  })
})

describe("assembleInstructions — classifier prompt", () => {
  it("contains the rubric and JSON output format", () => {
    expect(classifier).toMatch(/classify/i)
    expect(classifier).toMatch(/"classification":/)
  })
})

import { describe, it, expect, vi } from "vitest"

const generateReply = vi.fn().mockResolvedValue({
  text: "drafted",
  usage: {
    input_tokens: 1,
    output_tokens: 1,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
})
vi.mock("../../../generate-reply.js", () => ({
  generateReply: (...a: unknown[]) => generateReply(...a),
}))

import { DraftStep } from "../draft.js"
import { REPLY_HEADER } from "../../../instructions.js"
import type { StepContext, FlowStepConfig } from "../../types.js"

// Captures the `decisions` insert payload (reset on each makeCtx call) so a test
// can assert the proposed_actions the draft step persists.
let decisionInserts: Record<string, unknown>[] = []

function makeCtx(decision = "send_faq_reply"): StepContext {
  decisionInserts = []
  let table = ""
  const b: Record<string, unknown> = {}
  b.insert = vi.fn((p: Record<string, unknown>) => {
    if (table === "decisions") decisionInserts.push(p)
    return b
  })
  b.update = vi.fn(() => b)
  b.select = vi.fn(() => b)
  b.eq = vi.fn(() => b)
  b.order = vi.fn(async () => ({ data: [], error: null }))
  b.single = vi.fn(async () => ({ data: { id: "dec-1" }, error: null }))
  b.then = (r: (v: unknown) => void) => r({ data: null, error: null })
  return {
    email: {
      id: "e1",
      thread_id: null,
      from_email: "a@b.com",
      to_email: "s@b.com",
      subject: "hi",
      body_text: "x",
      agent_mail_message_id: null,
    },
    inboxId: null,
    product: null,
    classification: {
      classification: "faq",
      inquiry_type: "prospective_buyer",
      reasoning: "r",
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
    enrichment: null,
    decision: {
      decision,
      template_used: null,
      refund_request_count: null,
      combinedReasoning: "r",
      llmModel: "claude-haiku-4-5",
    },
    supabase: { from: (t: string) => ((table = t), b) } as never,
    anthropic: {} as never,
  }
}

const cfg = (ai_prompt: string | null): FlowStepConfig => ({
  step_key: "draft",
  position: 4,
  ai_prompt,
  condition: {},
})

describe("DraftStep reply instructions", () => {
  it("prepends the REPLY_HEADER guardrails to the node's prompt", async () => {
    generateReply.mockClear()
    await DraftStep.run(makeCtx(), cfg("CUSTOM_REPLY"))
    expect(generateReply.mock.calls[0]?.[0].replyInstructions).toBe(
      `${REPLY_HEADER}\n\n---\n\nCUSTOM_REPLY`
    )
  })

  it("still includes the guardrails when the node prompt is blank", async () => {
    generateReply.mockClear()
    await DraftStep.run(makeCtx(), cfg(null))
    expect(generateReply.mock.calls[0]?.[0].replyInstructions).toBe(
      `${REPLY_HEADER}\n\n---\n\n`
    )
  })

  it("decision 'unsubscribe' proposes suppress_contact and drafts a reply", async () => {
    generateReply.mockClear()
    await DraftStep.run(makeCtx("unsubscribe"), cfg("confirm removal"))
    // Proposes the opt-out (added to the suppression list + pushed to the
    // external system on approval) and still drafts the confirmation reply.
    expect(decisionInserts[0]?.proposed_actions).toEqual([
      { type: "suppress_contact", reason: "unsubscribe" },
    ])
    expect(generateReply).toHaveBeenCalled()
  })
})

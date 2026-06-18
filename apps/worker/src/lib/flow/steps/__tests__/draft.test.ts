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

function makeCtx(): StepContext {
  const b: Record<string, unknown> = {}
  b.insert = vi.fn(() => b)
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
      decision: "send_faq_reply",
      template_used: null,
      refund_request_count: null,
      combinedReasoning: "r",
      llmModel: "claude-haiku-4-5",
    },
    supabase: { from: () => b } as never,
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
})

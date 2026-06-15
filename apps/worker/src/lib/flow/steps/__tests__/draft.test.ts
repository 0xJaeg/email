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
import type { StepContext, FlowStepConfig } from "../../types.js"

function makeCtx(): StepContext {
  const b: Record<string, unknown> = {}
  b.insert = vi.fn(() => b)
  b.update = vi.fn(() => b)
  b.select = vi.fn(() => b)
  b.eq = vi.fn(() => b)
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
    instructions: { classifier: "GLOBAL_CLASSIFIER", reply: "GLOBAL_REPLY" },
  }
}

const cfg = (ai_prompt: string | null): FlowStepConfig => ({
  step_key: "draft",
  position: 4,
  ai_prompt,
  condition: {},
})

describe("DraftStep ai_prompt override", () => {
  it("passes config.ai_prompt as replyInstructions when set", async () => {
    generateReply.mockClear()
    await DraftStep.run(makeCtx(), cfg("CUSTOM_REPLY"))
    expect(generateReply.mock.calls[0]?.[0].replyInstructions).toBe(
      "CUSTOM_REPLY"
    )
  })

  it("falls back to instructions.reply when ai_prompt is null/blank", async () => {
    generateReply.mockClear()
    await DraftStep.run(makeCtx(), cfg(null))
    expect(generateReply.mock.calls[0]?.[0].replyInstructions).toBe(
      "GLOBAL_REPLY"
    )
  })
})

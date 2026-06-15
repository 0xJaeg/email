import { describe, it, expect, vi } from "vitest"
import { ClassifyStep } from "../classify.js"
import type { StepContext, FlowStepConfig } from "../../types.js"

function makeCtx() {
  const parse = vi.fn().mockResolvedValue({
    parsed_output: {
      classification: "faq",
      inquiry_type: "prospective_buyer",
      reasoning: "r",
    },
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  })
  const ctx: StepContext = {
    email: {
      id: "e1",
      thread_id: null,
      from_email: "a@b.com",
      to_email: "s@b.com",
      subject: "hi",
      body_text: "hello",
      agent_mail_message_id: null,
    },
    inboxId: null,
    product: null,
    supabase: {} as never,
    anthropic: {
      messages: { parse },
    } as unknown as StepContext["anthropic"],
    instructions: { classifier: "GLOBAL_CLASSIFIER", reply: "GLOBAL_REPLY" },
  }
  return { ctx, parse }
}

const cfg = (ai_prompt: string | null): FlowStepConfig => ({
  step_key: "classify",
  position: 1,
  ai_prompt,
  condition: {},
})

describe("ClassifyStep ai_prompt override", () => {
  it("uses config.ai_prompt as the system prompt when set", async () => {
    const { ctx, parse } = makeCtx()
    await ClassifyStep.run(ctx, cfg("CUSTOM_CLASSIFIER"))
    expect(parse.mock.calls[0]?.[0].system[0].text).toBe("CUSTOM_CLASSIFIER")
  })

  it("falls back to instructions.classifier when ai_prompt is null/blank", async () => {
    const { ctx, parse } = makeCtx()
    await ClassifyStep.run(ctx, cfg(null))
    expect(parse.mock.calls[0]?.[0].system[0].text).toBe("GLOBAL_CLASSIFIER")
  })
})

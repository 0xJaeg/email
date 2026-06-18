import { describe, it, expect, vi } from "vitest"
import { LookupGateStep } from "../lookup-gate.js"
import type { StepContext, FlowStepConfig } from "../../types.js"

function makeCtx(opts: { needs?: boolean; throws?: boolean }): StepContext {
  const parse = vi.fn(async () => {
    if (opts.throws) throw new Error("api down")
    return {
      parsed_output: { needs_lookup: opts.needs, reasoning: "r" },
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    }
  })
  return {
    email: {
      id: "e1",
      thread_id: null,
      from_email: "a@b.com",
      to_email: "s@b.com",
      subject: "login",
      body_text: "cant log in",
      agent_mail_message_id: null,
    },
    inboxId: null,
    product: null,
    classification: {
      classification: "faq",
      inquiry_type: "existing_member",
      reasoning: "r",
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
    supabase: {} as never,
    anthropic: {
      messages: { parse },
    } as unknown as StepContext["anthropic"],
  }
}

const cfg: FlowStepConfig = {
  step_key: "lookup_gate",
  position: 3,
  ai_prompt: null,
  condition: {},
}

describe("LookupGateStep", () => {
  it("sets needsLookup=true when the gate says yes", async () => {
    expect(
      (await LookupGateStep.run(makeCtx({ needs: true }), cfg)).needsLookup
    ).toBe(true)
  })

  it("sets needsLookup=false when the gate says no", async () => {
    expect(
      (await LookupGateStep.run(makeCtx({ needs: false }), cfg)).needsLookup
    ).toBe(false)
  })

  it("fails open (needsLookup undefined) when the AI call throws", async () => {
    const patch = await LookupGateStep.run(makeCtx({ throws: true }), cfg)
    expect(patch.needsLookup).toBeUndefined()
  })
})

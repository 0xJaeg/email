import { describe, it, expect, vi } from "vitest"
import { SpamFilterStep } from "../spam-filter.js"
import type { StepContext, FlowStepConfig } from "../../types.js"

function makeCtx(isSpam: boolean) {
  const parse = vi.fn().mockResolvedValue({
    parsed_output: { is_spam: isSpam, reasoning: "r" },
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  })
  const audits: Record<string, unknown>[] = []
  const b: Record<string, unknown> = {}
  b.select = vi.fn(() => b)
  b.eq = vi.fn(() => b)
  b.update = vi.fn(() => b)
  b.single = vi.fn(async () => ({ data: { id: "dec-spam" }, error: null }))
  b.then = (r: (v: unknown) => void) => r({ data: null, error: null })
  const from = (t: string) => {
    b.insert = vi.fn((p: Record<string, unknown>) => {
      if (t === "audit_log") audits.push(p)
      return b
    })
    return b
  }
  const ctx: StepContext = {
    email: {
      id: "e1",
      thread_id: null,
      from_email: "a@b.com",
      to_email: "s@b.com",
      subject: "WIN $$$",
      body_text: "buy now cheap",
      agent_mail_message_id: null,
    },
    inboxId: null,
    product: null,
    supabase: { from } as never,
    anthropic: {
      messages: { parse },
    } as unknown as StepContext["anthropic"],
    instructions: { classifier: "C", reply: "R" },
  }
  return { ctx, audits }
}

const cfg: FlowStepConfig = {
  step_key: "spam_filter",
  position: 1,
  ai_prompt: null,
  condition: {},
}

describe("SpamFilterStep", () => {
  it("halts + quarantines on spam", async () => {
    const { ctx, audits } = makeCtx(true)
    const patch = await SpamFilterStep.run(ctx, cfg)
    expect(patch.halt).toBe(true)
    expect(audits.some((a) => a.action === "spam_quarantined")).toBe(true)
  })

  it("passes through (no halt) when not spam", async () => {
    const { ctx } = makeCtx(false)
    const patch = await SpamFilterStep.run(ctx, cfg)
    expect(patch.halt).toBeUndefined()
  })
})

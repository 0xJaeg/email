import { describe, it, expect, vi } from "vitest"
import { SpamFilterStep } from "../spam-filter.js"
import type { StepContext, FlowStepConfig } from "../../types.js"

function makeCtx(parseImpl: () => Promise<unknown>) {
  const parse = vi.fn(parseImpl)
  const decisionInserts: Record<string, unknown>[] = []
  const audits: Record<string, unknown>[] = []
  const b: Record<string, unknown> = {}
  b.select = vi.fn(() => b)
  b.eq = vi.fn(() => b)
  b.update = vi.fn(() => b)
  b.single = vi.fn(async () => ({ data: { id: "dec-spam" }, error: null }))
  b.then = (r: (v: unknown) => void) => r({ data: null, error: null })
  const from = (t: string) => {
    b.insert = vi.fn((p: Record<string, unknown>) => {
      if (t === "decisions") decisionInserts.push(p)
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
  }
  return { ctx, decisionInserts, audits }
}

const ok = (is_spam: boolean) => async () => ({
  parsed_output: { is_spam, reasoning: "r" },
  usage: {
    input_tokens: 1,
    output_tokens: 1,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
})

const cfg: FlowStepConfig = {
  step_key: "spam_filter",
  position: 1,
  ai_prompt: null,
  condition: {},
}

describe("SpamFilterStep", () => {
  it("halts + writes a quarantined decision on spam", async () => {
    const { ctx, decisionInserts, audits } = makeCtx(ok(true))
    const patch = await SpamFilterStep.run(ctx, cfg)
    expect(patch.halt).toBe(true)
    expect(decisionInserts[0]).toMatchObject({
      email_id: "e1",
      classification: "spam",
      decision: "quarantine_spam",
      status: "quarantined",
    })
    expect(audits.some((a) => a.action === "spam_quarantined")).toBe(true)
  })

  it("passes through (no halt, no decision) when not spam", async () => {
    const { ctx, decisionInserts } = makeCtx(ok(false))
    const patch = await SpamFilterStep.run(ctx, cfg)
    expect(patch.halt).toBeUndefined()
    expect(decisionInserts).toHaveLength(0)
  })

  it("fails open (no halt) + audits failure when the AI call throws", async () => {
    const { ctx, audits } = makeCtx(async () => {
      throw new Error("api down")
    })
    const patch = await SpamFilterStep.run(ctx, cfg)
    expect(patch.halt).toBeUndefined()
    expect(audits.some((a) => a.action === "spam_filter_failed")).toBe(true)
  })
})

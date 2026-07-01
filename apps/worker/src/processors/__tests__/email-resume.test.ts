import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Job } from "bullmq"
import type { StepContext } from "../../lib/flow/types.js"

// Mutable per-test rows.
let emailRow: Record<string, unknown>
let priorDecisionRow: Record<string, unknown> | null

const threadUpdates: Record<string, unknown>[] = []

const supabase = {
  from: (table: string) => {
    const b: Record<string, unknown> = {}
    b.select = () => b
    b.eq = () => b
    b.update = (p: Record<string, unknown>) => {
      if (table === "threads") threadUpdates.push(p)
      return b
    }
    b.single = async () =>
      table === "emails"
        ? { data: emailRow, error: null }
        : { data: null, error: null }
    b.maybeSingle = async () => {
      if (table === "threads")
        return { data: { product_id: null, inbox_id: "ibx" }, error: null }
      if (table === "decisions") return { data: priorDecisionRow, error: null }
      return { data: null, error: null }
    }
    b.then = (r: (v: unknown) => void) => r({ data: null, error: null })
    return b
  },
}

// runGraph is mocked so we can assert the resume start key + inspect the ctx,
// without walking a real graph.
const runGraphMock = vi.fn((...a: unknown[]) => a[2])
vi.mock("../../lib/flow/run-graph.js", () => ({
  runGraph: (...a: unknown[]) => runGraphMock(...a),
}))
vi.mock("../../lib/flow/load-graph.js", () => ({
  loadGraph: async () => ({ startId: "s", nodes: new Map(), edges: new Map() }),
}))
vi.mock("../../lib/flow/node-registry.js", () => ({ NODE_REGISTRY: {} }))
vi.mock("../../lib/anthropic.js", () => ({ getAnthropic: () => ({}) }))
vi.mock("../../lib/supabase.js", () => ({ getSupabase: () => supabase }))
vi.mock("../../lib/product-facts.js", () => ({
  renderProductFacts: () => undefined,
}))
vi.mock("../../lib/strip-quotes.js", () => ({
  stripQuotedReply: (t: string | null) => t,
}))

import { processEmail } from "../email.js"

const job = { id: "j1", data: { emailId: "email-1" } } as unknown as Job

const baseEmail = {
  id: "email-1",
  thread_id: "th-1",
  from_email: "a@b.com",
  to_email: "s@b.com",
  subject: "Re: your refund",
  body_text: "no thanks, I still want the refund",
  agent_mail_message_id: "m1",
}

beforeEach(() => {
  runGraphMock.mockClear()
  threadUpdates.length = 0
  priorDecisionRow = {
    id: "d0",
    decision: "send_faq_reply",
    classification: "refund",
    template_used: "OFFER_1",
    refund_request_count: 1,
    context: { awaits_reply_at: "await_save_no_problem_reply" },
  }
})

describe("processEmail resume", () => {
  it("resumes at the awaited node with prior context when the email is a reply", async () => {
    emailRow = { ...baseEmail, is_reply: true, resumed_from_decision_id: "d0" }
    await processEmail(job)

    const call = runGraphMock.mock.calls[0]!
    const ctx = call[2] as StepContext
    const opts = call[3] as { startNodeKey?: string } | undefined
    expect(opts?.startNodeKey).toBe("await_save_no_problem_reply")
    expect(ctx.isReply).toBe(true)
    expect(ctx.priorDecision?.classification).toBe("refund")
    // Cursor cleared so the same reply isn't re-detected later.
    expect(threadUpdates).toContainEqual(
      expect.objectContaining({ resume_node_key: null })
    )
  })

  it("does a fresh run (no resume, no cursor clear) for a non-reply email", async () => {
    emailRow = {
      ...baseEmail,
      is_reply: false,
      resumed_from_decision_id: null,
    }
    await processEmail(job)

    const call = runGraphMock.mock.calls[0]!
    const ctx = call[2] as StepContext
    const opts = call[3] as { startNodeKey?: string } | undefined
    expect(opts).toBeUndefined()
    expect(ctx.priorDecision).toBeUndefined()
    expect(threadUpdates).toHaveLength(0)
  })

  it("falls back to a fresh run when the prior decision wasn't awaiting a reply", async () => {
    emailRow = { ...baseEmail, is_reply: true, resumed_from_decision_id: "d0" }
    priorDecisionRow = {
      id: "d0",
      decision: "send_faq_reply",
      classification: "faq",
      template_used: null,
      refund_request_count: null,
      context: {}, // no awaits_reply_at
    }
    await processEmail(job)

    const opts = runGraphMock.mock.calls[0]![3] as
      | { startNodeKey?: string }
      | undefined
    expect(opts).toBeUndefined()
    expect(threadUpdates).toHaveLength(0)
  })
})

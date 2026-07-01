import { describe, it, expect, vi, beforeEach } from "vitest"
import type { StepContext, FlowNode } from "../../types.js"

// Mock the reused draft logic + the prior-refund counter so we test only the
// new nodes' branching/decision behavior, not the draft/DB internals.
const draftRun = vi.fn()
vi.mock("../../steps/draft.js", () => ({
  DraftStep: { key: "draft", run: (...a: unknown[]) => draftRun(...a) },
}))
const countPriorRefundsMock = vi.fn()
vi.mock("../../../refund-decision.js", () => ({
  countPriorRefunds: (...a: unknown[]) => countPriorRefundsMock(...a),
}))

import { ReplyBranchNode } from "../reply-branch.js"
import { RefundDraftNode } from "../refund-draft.js"
import { StopNode } from "../stop.js"

const node = (config: Record<string, unknown> = {}): FlowNode => ({
  id: "n",
  node_key: "n",
  node_type: "n",
  ai_prompt: "prompt",
  model: null,
  config,
})

const email = {
  id: "e1",
  thread_id: "t1",
  from_email: "a@b.com",
  to_email: "s@b.com",
  subject: "hi",
  body_text: "no thanks, I still want my money back",
  agent_mail_message_id: null,
}

const parseResult = (outcome: string) => ({
  parsed_output: { outcome, reasoning: "customer said so" },
  usage: {
    input_tokens: 1,
    output_tokens: 1,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
})

beforeEach(() => {
  draftRun.mockReset().mockResolvedValue({ decisionId: "dec-1" })
  countPriorRefundsMock.mockReset().mockResolvedValue(1)
})

describe("reply_branch node", () => {
  it("emits the AI-chosen branch as the outcome", async () => {
    const parse = vi.fn().mockResolvedValue(parseResult("no_problem"))
    const ctx = {
      email,
      anthropic: { messages: { parse } },
      classification: {
        classification: "refund",
        inquiry_type: "existing_member",
        reasoning: "r",
        usage: {},
      },
    } as unknown as StepContext
    const r = await ReplyBranchNode.run(
      ctx,
      node({ branches: [{ key: "problem" }, { key: "no_problem" }] })
    )
    expect(r.outcome).toBe("no_problem")
    // Fresh run already has a classification — the branch must not overwrite it.
    expect(r.classification).toBeUndefined()
  })

  it("on resume, carries the prior decision's classification onto ctx", async () => {
    const parse = vi.fn().mockResolvedValue(parseResult("not_accepted"))
    const ctx = {
      email,
      anthropic: { messages: { parse } },
      priorDecision: {
        decisionId: "d0",
        decision: "send_offer_1",
        classification: "refund",
        template_used: "OFFER_1",
        refund_request_count: 1,
        context: { inquiry_type: "existing_member" },
        resumeNodeKey: "await_save_no_problem_reply",
      },
    } as unknown as StepContext
    const r = await ReplyBranchNode.run(
      ctx,
      node({ branches: [{ key: "accepted" }, { key: "not_accepted" }] })
    )
    expect(r.outcome).toBe("not_accepted")
    expect(r.classification?.classification).toBe("refund")
  })

  it("throws if the node has no branches configured", async () => {
    const ctx = {
      email,
      anthropic: { messages: { parse: vi.fn() } },
    } as unknown as StepContext
    await expect(ReplyBranchNode.run(ctx, node({}))).rejects.toThrow(
      /no branches/
    )
  })
})

describe("refund_draft node", () => {
  it("drafts an issue_refund decision (via DraftStep) and never refunds inline", async () => {
    const ctx = {
      email,
      supabase: {} as never,
      classification: {
        classification: "refund",
        inquiry_type: "existing_member",
        reasoning: "still wants refund",
        usage: {},
      },
    } as unknown as StepContext
    const r = await RefundDraftNode.run(ctx, node())
    expect(ctx.decision?.decision).toBe("issue_refund")
    expect(ctx.decision?.template_used).toBe("REFUND_CONFIRMATION")
    expect(ctx.decision?.refund_request_count).toBe(2) // countPriorRefunds(1) + 1
    // Delegates to DraftStep (draft-only path); the actual refund is at approval.
    expect(draftRun).toHaveBeenCalledOnce()
    expect(r.outcome).toBe("done")
  })

  it("throws if classification is missing", async () => {
    const ctx = { email, supabase: {} as never } as unknown as StepContext
    await expect(RefundDraftNode.run(ctx, node())).rejects.toThrow(
      /classification missing/
    )
  })
})

describe("stop node", () => {
  it("writes a closed do_nothing decision and halts (nothing sent)", async () => {
    const inserts: Record<string, unknown>[] = []
    let table = ""
    const b: Record<string, unknown> = {}
    b.insert = vi.fn((p: Record<string, unknown>) => {
      if (table === "decisions") inserts.push(p)
      return b
    })
    b.select = vi.fn(() => b)
    b.single = vi.fn(async () => ({ data: { id: "dec-9" }, error: null }))
    b.then = (r: (v: unknown) => void) => r({ data: null, error: null })
    const ctx = {
      email,
      product: { productId: "p1" },
      classification: {
        classification: "refund",
        inquiry_type: "existing_member",
        reasoning: "accepted the offer",
        usage: {},
      },
      supabase: { from: (t: string) => ((table = t), b) },
    } as unknown as StepContext
    const r = await StopNode.run(ctx, node())
    expect(inserts[0]?.decision).toBe("do_nothing")
    expect(inserts[0]?.status).toBe("closed")
    expect(inserts[0]?.proposed_actions).toEqual([])
    expect(r).toMatchObject({ outcome: "done", halt: true, decisionId: "dec-9" })
  })
})

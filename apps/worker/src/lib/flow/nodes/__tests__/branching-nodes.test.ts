import { describe, it, expect, vi, beforeEach } from "vitest"
import type { StepContext, FlowNode } from "../../types.js"

// Mock the reused step logic so we test only the new outcome/threading behavior.
const enrichRun = vi.fn()
vi.mock("../../steps/enrich.js", () => ({
  EnrichStep: { key: "enrich", run: (...a: unknown[]) => enrichRun(...a) },
}))
const draftRun = vi.fn()
vi.mock("../../steps/draft.js", () => ({
  DraftStep: { key: "draft", run: (...a: unknown[]) => draftRun(...a) },
}))
const decideRefundMock = vi.fn()
vi.mock("../../../refund-decision.js", () => ({
  decideRefund: (...a: unknown[]) => decideRefundMock(...a),
}))

import { OrderLookupNode } from "../order-lookup.js"
import { RefundLadderNode } from "../refund-ladder.js"
import { SendReplyNode } from "../send-reply.js"
import { ClassifyNode } from "../classify.js"

const node = (config: Record<string, unknown> = {}): FlowNode => ({
  id: "n",
  node_key: "n",
  node_type: "n",
  ai_prompt: null,
  model: null,
  config,
})

const ctxWith = (over: Partial<StepContext> = {}): StepContext =>
  ({
    classification: {
      classification: "refund",
      inquiry_type: "existing_member",
      reasoning: "r",
      usage: {},
    },
    instructions: { classifier: "C", reply: "R" },
    ...over,
  }) as unknown as StepContext

beforeEach(() => {
  enrichRun.mockReset()
  draftRun.mockReset().mockResolvedValue({ decisionId: "dec-1" })
  decideRefundMock.mockReset()
})

describe("order_lookup node", () => {
  it("emits 'found' when the adapter returns orders", async () => {
    enrichRun.mockResolvedValue({
      enrichment: { context: { orders: [{ orderId: "O-1" }], access: {} } },
    })
    const r = await OrderLookupNode.run(ctxWith(), node())
    expect(r.outcome).toBe("found")
  })

  it("emits 'not_found' for no orders or no enrichment", async () => {
    enrichRun.mockResolvedValue({ enrichment: { context: { orders: [] } } })
    expect((await OrderLookupNode.run(ctxWith(), node())).outcome).toBe(
      "not_found"
    )
    enrichRun.mockResolvedValue({ enrichment: null })
    expect((await OrderLookupNode.run(ctxWith(), node())).outcome).toBe(
      "not_found"
    )
  })

  it("forces the lookup (sets needsLookup) before delegating", async () => {
    enrichRun.mockResolvedValue({ enrichment: null })
    const ctx = ctxWith()
    await OrderLookupNode.run(ctx, node())
    expect(ctx.needsLookup).toBe(true)
  })
})

describe("refund_ladder node", () => {
  it("emits the ladder stage and sets ctx.decision", async () => {
    decideRefundMock.mockResolvedValue({
      decision: "send_offer_1",
      template_used: "OFFER_1",
      refund_request_count: 1,
      sonnet_usage: null,
    })
    const ctx = ctxWith()
    const r = await RefundLadderNode.run(ctx, node())
    expect(r.outcome).toBe("send_offer_1")
    expect(ctx.decision?.decision).toBe("send_offer_1")
    expect(ctx.decision?.template_used).toBe("OFFER_1")
  })
})

describe("send_reply node", () => {
  it("synthesizes ctx.decision from config when none upstream, then drafts", async () => {
    const ctx = ctxWith()
    const r = await SendReplyNode.run(
      ctx,
      node({ decision: "send_faq_reply", template: "FAQ_REPLY" })
    )
    expect(ctx.decision?.decision).toBe("send_faq_reply")
    expect(draftRun).toHaveBeenCalledOnce()
    expect(r.outcome).toBe("done")
  })

  it("keeps an upstream decision (refund_ladder) intact", async () => {
    const ctx = ctxWith({
      decision: {
        decision: "issue_refund",
        template_used: "REFUND_CONFIRMATION",
        refund_request_count: 3,
        combinedReasoning: "x",
        llmModel: "claude-haiku-4-5",
      },
    })
    await SendReplyNode.run(ctx, node({ decision: "send_faq_reply" }))
    expect(ctx.decision?.decision).toBe("issue_refund")
  })
})

describe("classify node (config categories)", () => {
  it("classifies into the configured categories and emits the chosen one", async () => {
    const parse = vi.fn().mockResolvedValue({
      parsed_output: {
        classification: "login_access",
        inquiry_type: "existing_member",
        reasoning: "can't log in",
      },
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    })
    const ctx = ctxWith({
      email: {
        id: "e",
        thread_id: null,
        from_email: "a@b.c",
        to_email: "s@x.c",
        subject: "help",
        body_text: "cannot log in",
        agent_mail_message_id: null,
      },
      anthropic: { messages: { parse } } as never,
    })
    const r = await ClassifyNode.run(
      ctx,
      node({
        categories: [
          { key: "login_access", description: "login or access problems" },
          { key: "sales", description: "pre-sale questions" },
        ],
      })
    )
    expect(r.outcome).toBe("login_access")
    expect(parse).toHaveBeenCalledOnce()
  })
})

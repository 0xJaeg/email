import { describe, it, expect, vi } from "vitest"

const gatherCustomerContext = vi.fn().mockResolvedValue({
  context: { orders: [{ orderId: "O-1" }], access: { hasAccess: true } },
  customerContext: "ctx",
})
vi.mock("../../../customer-context.js", () => ({
  gatherCustomerContext: (...a: unknown[]) => gatherCustomerContext(...a),
}))
vi.mock("@workspace/actions", () => ({ getAdapter: () => ({ key: "mock" }) }))

import { EnrichStep } from "../enrich.js"
import type { StepContext, FlowStepConfig } from "../../types.js"

function makeCtx(opts: {
  needsLookup?: boolean
  inquiry_type?: "existing_member" | "prospective_buyer"
}): StepContext {
  const b: Record<string, unknown> = {}
  b.insert = vi.fn(() => b)
  b.then = (r: (v: unknown) => void) => r({ data: null, error: null })
  return {
    email: {
      id: "e1",
      thread_id: null,
      from_email: "a@b.com",
      to_email: "s@b.com",
      subject: "s",
      body_text: "b",
      agent_mail_message_id: null,
    },
    inboxId: null,
    product: {
      productId: "p1",
      adapterKey: "mock",
      name: "P",
      supportConfig: null,
    },
    classification: {
      classification: "faq",
      inquiry_type: opts.inquiry_type ?? "prospective_buyer",
      reasoning: "r",
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
    needsLookup: opts.needsLookup,
    supabase: { from: () => b } as never,
    anthropic: {} as never,
    instructions: { classifier: "C", reply: "R" },
  }
}

const cfg: FlowStepConfig = {
  step_key: "enrich",
  position: 4,
  ai_prompt: null,
  condition: {},
}

describe("EnrichStep needsLookup gate", () => {
  it("looks up when needsLookup=true even if not an existing member", async () => {
    gatherCustomerContext.mockClear()
    const patch = await EnrichStep.run(
      makeCtx({ needsLookup: true, inquiry_type: "prospective_buyer" }),
      cfg
    )
    expect(gatherCustomerContext).toHaveBeenCalled()
    expect(patch.enrichment).not.toBeNull()
  })

  it("skips when needsLookup=false even for an existing member", async () => {
    gatherCustomerContext.mockClear()
    const patch = await EnrichStep.run(
      makeCtx({ needsLookup: false, inquiry_type: "existing_member" }),
      cfg
    )
    expect(gatherCustomerContext).not.toHaveBeenCalled()
    expect(patch.enrichment).toBeNull()
  })

  it("falls back to inquiry_type when needsLookup is undefined", async () => {
    gatherCustomerContext.mockClear()
    const patch = await EnrichStep.run(
      makeCtx({ inquiry_type: "existing_member" }),
      cfg
    )
    expect(gatherCustomerContext).toHaveBeenCalled()
    expect(patch.enrichment).not.toBeNull()
  })
})

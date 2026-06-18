import { describe, it, expect, vi } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import type { ServerClient } from "@workspace/db/client"
import { decideRefund } from "../refund-decision.js"

const email = {
  id: "email-1",
  from_email: "alice@example.com",
  body_text: "I'd like a refund please.", // no chargeback words
}

// Supabase stub: `decisions` count (awaited) returns `priorRefunds` matching
// rows; `action_triggers` (maybeSingle) returns the configured threshold.
function makeSupabase(opts: {
  priorRefunds: number
  threshold: number | null
}) {
  const make = () => {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.eq = vi.fn(() => b)
    b.gte = vi.fn(() => b)
    b.maybeSingle = vi.fn(async () => ({
      data:
        opts.threshold == null
          ? null
          : { condition: { after_n_requests: opts.threshold } },
      error: null,
    }))
    b.then = (resolve: (v: unknown) => void) =>
      resolve({
        data: Array.from({ length: opts.priorRefunds }, () => ({
          id: "d",
          emails: { from_email: email.from_email },
        })),
        error: null,
      })
    return b
  }
  return { from: vi.fn(() => make()) } as unknown as ServerClient
}

const anthropic = { messages: { parse: vi.fn() } } as unknown as Anthropic

function run(priorRefunds: number, threshold: number | null) {
  return decideRefund({
    email,
    supabase: makeSupabase({ priorRefunds, threshold }),
    anthropic,
    productId: "prod-1",
  })
}

describe("decideRefund — configurable refund threshold", () => {
  it("defaults to refunding on the 3rd request when no trigger is set", async () => {
    expect((await run(0, null)).decision).toBe("send_offer_1")
    expect((await run(1, null)).decision).toBe("send_offer_2")
    expect((await run(2, null)).decision).toBe("issue_refund")
  })

  it("refunds earlier when the product's threshold is lower (after_n_requests = 2)", async () => {
    // 2nd request (priorRefunds = 1) should refund now, not offer again.
    expect((await run(1, 2)).decision).toBe("issue_refund")
  })

  it("holds off longer when the threshold is higher (after_n_requests = 4)", async () => {
    expect((await run(2, 4)).decision).toBe("send_offer_2")
    expect((await run(3, 4)).decision).toBe("issue_refund")
  })
})

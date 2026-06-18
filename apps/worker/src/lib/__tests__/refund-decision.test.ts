import { describe, it, expect, vi } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import type { ServerClient } from "@workspace/db/client"
import { decideRefund } from "../refund-decision.js"

const email = {
  id: "email-1",
  from_email: "alice@example.com",
  body_text: "I'd like a refund please.", // no chargeback words
}

// Supabase stub: the `decisions` count (awaited) returns `priorRefunds` rows.
function makeSupabase(priorRefunds: number) {
  const make = () => {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.eq = vi.fn(() => b)
    b.gte = vi.fn(() => b)
    b.then = (resolve: (v: unknown) => void) =>
      resolve({
        data: Array.from({ length: priorRefunds }, () => ({
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

function run(priorRefunds: number, refundThreshold: number | null) {
  return decideRefund({
    email,
    supabase: makeSupabase(priorRefunds),
    anthropic,
    refundThreshold,
  })
}

describe("decideRefund — configurable refund threshold", () => {
  it("defaults to refunding on the 3rd request when no threshold is set", async () => {
    expect((await run(0, null)).decision).toBe("send_offer_1")
    expect((await run(1, null)).decision).toBe("send_offer_2")
    expect((await run(2, null)).decision).toBe("issue_refund")
  })

  it("refunds earlier when the product's threshold is lower (2)", async () => {
    // 2nd request (priorRefunds = 1) should refund now, not offer again.
    expect((await run(1, 2)).decision).toBe("issue_refund")
  })

  it("holds off longer when the threshold is higher (4)", async () => {
    expect((await run(2, 4)).decision).toBe("send_offer_2")
    expect((await run(3, 4)).decision).toBe("issue_refund")
  })
})

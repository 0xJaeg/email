import { describe, it, expect } from "vitest"
import { getAdapter } from "../get-adapter.js"

const refundArgs = {
  orderId: "ord_1",
  customerEmail: "alice@example.com",
  amount: 97,
}

describe("getAdapter", () => {
  it("returns the mock adapter, which issues a mock refund id", async () => {
    const adapter = getAdapter("mock")
    expect(adapter.key).toBe("mock")
    const result = await adapter.issueRefund(refundArgs)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.refundId).toMatch(/^mock-[0-9a-f-]+$/)
  })

  it("returns the clickbank adapter, which fails until credentials are configured", async () => {
    const adapter = getAdapter("clickbank")
    const result = await adapter.issueRefund(refundArgs)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/not configured|credentials/i)
  })

  it("throws on an unknown adapter key", () => {
    expect(() => getAdapter("nope")).toThrow(/unknown_adapter/)
  })
})

describe("adapter enrichment (lookupOrder / checkAccess)", () => {
  it("mock: lookupOrder returns a found order", async () => {
    const r = await getAdapter("mock").lookupOrder({ email: "alice@example.com" })
    expect(r.found).toBe(true)
    expect(r.orders.length).toBeGreaterThan(0)
    expect(r.orders[0]?.orderId).toBeTruthy()
  })

  it("mock: checkAccess grants access with details to send", async () => {
    const r = await getAdapter("mock").checkAccess({
      email: "alice@example.com",
      order: null,
    })
    expect(r.hasAccess).toBe(true)
    expect(r.details).toBeTruthy()
  })

  it("clickbank: lookupOrder returns not-found until credentials are configured", async () => {
    const r = await getAdapter("clickbank").lookupOrder({ email: "x@y.com" })
    expect(r.found).toBe(false)
    expect(r.orders).toEqual([])
  })
})

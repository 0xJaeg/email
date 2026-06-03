import { describe, it, expect } from "vitest"
import { gatherCustomerContext } from "../customer-context.js"
import type { ProductAdapter } from "@workspace/actions"

function adapter(over: Partial<ProductAdapter> = {}): ProductAdapter {
  return {
    key: "test",
    async lookupOrder() {
      return {
        found: true,
        orders: [
          {
            orderId: "O-1",
            productName: "Pro Course",
            amount: 47,
            currency: "USD",
            purchasedAt: "2026-05-01",
          },
        ],
      }
    },
    async checkAccess() {
      return { hasAccess: true, details: "Login at https://members.example.com" }
    },
    async issueRefund() {
      return { ok: true, refundId: "r" }
    },
    ...over,
  }
}

describe("gatherCustomerContext", () => {
  it("summarizes a found purchase + active access for the reply prompt", async () => {
    const r = await gatherCustomerContext(adapter(), { from_email: "a@x.com" })
    expect(r.customerContext).toContain("O-1")
    expect(r.customerContext).toMatch(/access/i)
    expect(r.context).toMatchObject({ access: { hasAccess: true } })
  })

  it("flags missing access so the reply can address it", async () => {
    const r = await gatherCustomerContext(
      adapter({
        async checkAccess() {
          return { hasAccess: false, details: null }
        },
      }),
      { from_email: "a@x.com" }
    )
    expect(r.customerContext).toMatch(/not found|no access|NOT/i)
  })

  it("notes when no purchase is found for the sender", async () => {
    const r = await gatherCustomerContext(
      adapter({
        async lookupOrder() {
          return { found: false, orders: [] }
        },
      }),
      { from_email: "a@x.com" }
    )
    expect(r.customerContext).toMatch(/no purchase/i)
  })
})

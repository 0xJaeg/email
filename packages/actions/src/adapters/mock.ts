import { randomUUID } from "node:crypto"
import type { ProductAdapter } from "../types.js"

// Safe default adapter: never calls a real payment/membership API. Returns
// representative canned data so the pipeline and simulation harness exercise the
// enrichment + reply path without real integrations, and no real money moves.
export const MockAdapter: ProductAdapter = {
  key: "mock",
  async lookupOrder() {
    return {
      found: true,
      orders: [
        {
          orderId: "MOCK-1001",
          productName: "Default Product",
          amount: 97,
          currency: "USD",
          purchasedAt: "2026-05-01",
        },
      ],
    }
  },
  async checkAccess() {
    return {
      hasAccess: true,
      details: "Your account is active.",
    }
  },
  async issueRefund() {
    return { ok: true, refundId: `mock-${randomUUID()}` }
  },
}

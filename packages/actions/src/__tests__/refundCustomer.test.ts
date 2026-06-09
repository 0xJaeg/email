import { describe, it, expect, vi } from "vitest"
import { refundCustomer } from "../refundCustomer.js"
import type { ServerClient } from "@workspace/db/client"

function mockSupabase() {
  const auditInsert = vi.fn().mockResolvedValue({ data: null, error: null })
  const supabase = {
    from: vi.fn(() => ({ insert: auditInsert })),
  } as unknown as ServerClient
  return { supabase, auditInsert }
}

describe("refundCustomer", () => {
  it("via the mock adapter, returns ok with a mock-<uuid> refund id", async () => {
    const { supabase } = mockSupabase()
    const result = await refundCustomer({
      decisionId: "decision-1",
      customerEmail: "alice@example.com",
      orderId: "ord_123",
      amount: 97,
      adapterKey: "mock",
      supabase,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.refundId).toMatch(/^mock-[0-9a-f-]+$/)
  })

  it("audits a mock refund as refund_customer_stub with the adapter recorded", async () => {
    const { supabase, auditInsert } = mockSupabase()
    await refundCustomer({
      decisionId: "decision-1",
      customerEmail: "alice@example.com",
      orderId: "ord_123",
      amount: 97,
      adapterKey: "mock",
      supabase,
    })
    expect(supabase.from).toHaveBeenCalledWith("audit_log")
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "refund_customer_stub",
        status: "success",
        payload: expect.objectContaining({
          decision_id: "decision-1",
          customer_email: "alice@example.com",
          order_id: "ord_123",
          amount: 97,
          adapter: "mock",
          mock: true,
        }),
      })
    )
  })

  it("returns ok:false and audits a failure when the adapter is unconfigured", async () => {
    const { supabase, auditInsert } = mockSupabase()
    const result = await refundCustomer({
      decisionId: "decision-2",
      customerEmail: "bob@example.com",
      orderId: null,
      amount: null,
      adapterKey: "clickbank",
      supabase,
    })
    expect(result.ok).toBe(false)
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "refund_customer",
        status: "failure",
      })
    )
  })
})

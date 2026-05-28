import { describe, it, expect, vi } from "vitest"
import { refundCustomer } from "../refundCustomer.js"
import type { ServerClient } from "@workspace/db/client"

function mockSupabase() {
  const auditInsert = vi.fn().mockResolvedValue({ data: null, error: null })
  const supabase = {
    from: vi.fn((table: string) => ({
      insert: auditInsert,
    })),
  } as unknown as ServerClient
  return { supabase, auditInsert }
}

describe("refundCustomer (stub)", () => {
  it("returns ok with a stub-<uuid> refund id", async () => {
    const { supabase } = mockSupabase()
    const result = await refundCustomer({
      decisionId: "decision-1",
      customerEmail: "alice@example.com",
      orderId: "ord_123",
      amount: 97,
      supabase,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.refundId).toMatch(/^stub-[0-9a-f-]+$/)
    }
  })

  it("writes an audit_log row capturing the intended refund", async () => {
    const { supabase, auditInsert } = mockSupabase()
    await refundCustomer({
      decisionId: "decision-1",
      customerEmail: "alice@example.com",
      orderId: "ord_123",
      amount: 97,
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
          stub: true,
        }),
      })
    )
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { suppressContact } from "../suppressContact.js"
import type { ServerClient } from "@workspace/db/client"

function mockSupabase(upsertErr: { message: string } | null = null) {
  const auditInsert = vi.fn().mockResolvedValue({ data: null, error: null })
  const upsert = vi.fn().mockResolvedValue({ data: null, error: upsertErr })
  const supabase = {
    from: vi.fn((t: string) =>
      t === "suppression_list" ? { upsert } : { insert: auditInsert }
    ),
  } as unknown as ServerClient
  return { supabase, auditInsert, upsert }
}

describe("suppressContact", () => {
  beforeEach(() => {
    delete process.env.SUPPRESSION_WEBHOOK_URL
  })

  it("records the normalized email and audits suppress_contact", async () => {
    const { supabase, auditInsert, upsert } = mockSupabase()
    const r = await suppressContact({
      decisionId: "d1",
      email: "  Alice@Example.com ",
      reason: "refund",
      supabase,
    })
    expect(r.ok).toBe(true)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ email: "alice@example.com", reason: "refund" }),
      expect.anything()
    )
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "suppress_contact", status: "success" })
    )
  })

  it("returns ok:false and audits failure when the record can't be written", async () => {
    const { supabase, auditInsert } = mockSupabase({ message: "db down" })
    const r = await suppressContact({
      decisionId: "d1",
      email: "a@x.com",
      reason: "refund",
      supabase,
    })
    expect(r.ok).toBe(false)
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "suppress_contact", status: "failure" })
    )
  })
})

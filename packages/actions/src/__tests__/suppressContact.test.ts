import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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
    delete process.env.APP_ENV // = development (the safe default)
    process.env.MAILWIZZ_API_URL = "https://portal.example.com/api/index.php"
    process.env.MAILWIZZ_API_KEY = "test-key"
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.APP_ENV
    delete process.env.MAILWIZZ_API_URL
    delete process.env.MAILWIZZ_API_KEY
  })

  it("records the normalized email and audits suppress_contact", async () => {
    const { supabase, auditInsert, upsert } = mockSupabase()
    const r = await suppressContact({
      decisionId: "d1",
      emailId: "email-1",
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
      expect.objectContaining({
        action: "suppress_contact",
        status: "success",
        email_id: "email-1",
      })
    )
  })

  it("returns ok:false and audits failure when the record can't be written", async () => {
    const { supabase, auditInsert } = mockSupabase({ message: "db down" })
    const r = await suppressContact({
      decisionId: "d1",
      emailId: "email-1",
      email: "a@x.com",
      reason: "refund",
      supabase,
    })
    expect(r.ok).toBe(false)
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "suppress_contact", status: "failure" })
    )
  })

  it("in development, records the opt-out but skips the real MailWizz call", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock) // APP_ENV unset = development
    const { supabase, auditInsert, upsert } = mockSupabase()
    const r = await suppressContact({
      decisionId: "d1",
      emailId: "email-1",
      email: "a@x.com",
      reason: "unsubscribe",
      supabase,
    })
    expect(r.ok).toBe(true)
    expect(upsert).toHaveBeenCalled() // internal opt-out still recorded
    expect(fetchMock).not.toHaveBeenCalled() // no real MailWizz call in dev
    const payload = auditInsert.mock.calls[0]?.[0].payload
    expect(payload.mailwizz).toBe("skipped (development)")
  })

  it("in production, calls MailWizz and audits the endpoint + status", async () => {
    process.env.APP_ENV = "production"
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal("fetch", fetchMock)
    const { supabase, auditInsert } = mockSupabase()
    const r = await suppressContact({
      decisionId: "d1",
      emailId: "email-1",
      email: "a@x.com",
      reason: "unsubscribe",
      supabase,
    })
    expect(r.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const payload = auditInsert.mock.calls[0]?.[0].payload
    expect(payload.mailwizz).toMatchObject({
      method: "PUT",
      status: 200,
      outcome: "unsubscribed",
    })
    expect(payload.mailwizz.endpoint).toContain(
      "unsubscribe-by-email-from-all-lists"
    )
  })

  it("a MailWizz failure in production still succeeds (DB is source of truth)", async () => {
    process.env.APP_ENV = "production"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    )
    const { supabase } = mockSupabase()
    const r = await suppressContact({
      decisionId: "d1",
      emailId: "email-1",
      email: "a@x.com",
      reason: "unsubscribe",
      supabase,
    })
    expect(r.ok).toBe(true)
  })
})

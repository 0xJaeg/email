import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { coachingSignup } from "../coachingSignup.js"
import type { ServerClient } from "@workspace/db/client"

function mockSupabase() {
  const auditInsert = vi.fn().mockResolvedValue({ data: null, error: null })
  const supabase = {
    from: vi.fn(() => ({ insert: auditInsert })),
  } as unknown as ServerClient
  return { supabase, auditInsert }
}

const args = (supabase: ServerClient) => ({
  decisionId: "d1",
  emailId: "email-1",
  email: "  Alice@Example.com ",
  supabase,
})

describe("coachingSignup", () => {
  beforeEach(() => {
    delete process.env.APP_ENV // development is the safe default
    process.env.MAILWIZZ_API_URL = "https://portal.example.com/api/index.php"
    process.env.MAILWIZZ_API_KEY = "test-key"
    process.env.MAILWIZZ_COACHING_LIST_UID = "list-abc"
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.APP_ENV
    delete process.env.MAILWIZZ_API_URL
    delete process.env.MAILWIZZ_API_KEY
    delete process.env.MAILWIZZ_COACHING_LIST_UID
  })

  it("in development, skips the real call and audits success", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { supabase, auditInsert } = mockSupabase()
    const r = await coachingSignup(args(supabase))
    expect(r).toEqual({ ok: true, detail: "skipped (development)" })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "coaching_signup", status: "success" })
    )
  })

  it("in production, subscribes to the list and audits the endpoint", async () => {
    process.env.APP_ENV = "production"
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => '{"status":"success"}',
    })
    vi.stubGlobal("fetch", fetchMock)
    const { supabase, auditInsert } = mockSupabase()
    const r = await coachingSignup(args(supabase))
    expect(r.ok).toBe(true)
    expect(r.detail).toBe("subscribed")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const payload = auditInsert.mock.calls[0]?.[0].payload
    expect(payload.mailwizz.endpoint).toContain("/lists/list-abc/subscribers")
  })

  it("returns not_configured (ok:false) in production without a list uid, and never blocks", async () => {
    process.env.APP_ENV = "production"
    delete process.env.MAILWIZZ_COACHING_LIST_UID
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { supabase } = mockSupabase()
    const r = await coachingSignup(args(supabase))
    expect(r).toEqual({ ok: false, detail: "not_configured" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

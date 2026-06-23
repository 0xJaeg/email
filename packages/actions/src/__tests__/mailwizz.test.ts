import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { unsubscribeFromAllLists } from "../mailwizz.js"

function mockFetch(body: string, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, text: async () => body })
}

describe("mailwizz unsubscribeFromAllLists", () => {
  beforeEach(() => {
    process.env.MAILWIZZ_API_URL = "https://portal.example.com/api/index.php"
    process.env.MAILWIZZ_API_KEY = "test-key"
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.MAILWIZZ_API_URL
    delete process.env.MAILWIZZ_API_KEY
  })

  it("PUTs the all-lists unsubscribe with X-Api-Key + EMAIL body; success → outcome success", async () => {
    const fetchMock = mockFetch('{"status":"success"}')
    vi.stubGlobal("fetch", fetchMock)

    const r = await unsubscribeFromAllLists("jane@example.com")

    expect(r.outcome).toBe("success")
    expect(r.status).toBe(200)
    expect(r.detail).toBe("unsubscribed")
    expect(r.request).toBe("EMAIL=jane@example.com")
    expect(r.response).toContain("success")
    const call = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ]
    expect(call[0]).toBe(
      "https://portal.example.com/api/index.php/lists/subscribers/unsubscribe-by-email-from-all-lists"
    )
    expect(call[1].method).toBe("PUT")
    expect(call[1].headers["X-Api-Key"]).toBe("test-key")
    expect(String(call[1].body)).toBe("EMAIL=jane%40example.com")
  })

  it("maps a 'subscriber not found' error response to email_not_found", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch('{"status":"error","error":"Subscriber not found"}')
    )
    const r = await unsubscribeFromAllLists("x@y.com")
    expect(r.outcome).toBe("email_not_found")
  })

  it("maps a non-OK HTTP response to failed (no throw)", async () => {
    vi.stubGlobal("fetch", mockFetch("", false, 500))
    const r = await unsubscribeFromAllLists("x@y.com")
    expect(r.outcome).toBe("failed")
    expect(r.status).toBe(500)
    expect(r.detail).toBe("http_500")
  })

  it("returns failed/not_configured (no fetch) when the key is missing", async () => {
    delete process.env.MAILWIZZ_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const r = await unsubscribeFromAllLists("x@y.com")
    expect(r.outcome).toBe("failed")
    expect(r.detail).toBe("not_configured")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

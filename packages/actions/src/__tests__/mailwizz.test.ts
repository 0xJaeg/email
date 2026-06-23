import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { unsubscribeFromAllLists } from "../mailwizz.js"

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

  it("PUTs the all-lists unsubscribe with the X-Api-Key header + EMAIL body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal("fetch", fetchMock)

    const r = await unsubscribeFromAllLists("jane@example.com")

    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(r.detail).toBe("unsubscribed")
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

  it("returns ok:false with the HTTP status on a non-OK response (no throw)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    )
    const r = await unsubscribeFromAllLists("x@y.com")
    expect(r.ok).toBe(false)
    expect(r.status).toBe(500)
    expect(r.detail).toBe("http_500")
  })

  it("returns not_configured (no fetch) when the key is missing", async () => {
    delete process.env.MAILWIZZ_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const r = await unsubscribeFromAllLists("x@y.com")
    expect(r.ok).toBe(false)
    expect(r.detail).toBe("not_configured")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

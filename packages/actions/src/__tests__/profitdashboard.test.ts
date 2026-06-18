import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getAdapter } from "../get-adapter.js"

// The real response shape (with PII fields we must NOT surface).
const SAMPLE = {
  status: true,
  message: "User found",
  data: {
    exists: true,
    email: "Madhav5448@gmail.com",
    firstName: "Madhav",
    lastName: "sharma",
    address: "ater road",
    phone: "9977176638",
    username: "madhav",
    product: { key: "mobile_profit", displayName: "Profit Dashboard" },
    loginCount: 251,
    role: "member",
    lastLoginAt: "2026-06-18T06:06:11.000Z",
    createdAt: "2025-09-30T03:17:03.000Z",
  },
}

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, json: async () => body })
}

describe("profitdashboard adapter", () => {
  beforeEach(() => {
    process.env.PROFITDASHBOARD_API_KEY = "test-key"
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.PROFITDASHBOARD_API_KEY
  })

  it("checkAccess maps a found member to access + PII-light details", async () => {
    const fetchMock = mockFetch(SAMPLE)
    vi.stubGlobal("fetch", fetchMock)

    const r = await getAdapter("profitdashboard").checkAccess({
      email: "Madhav <Madhav5448@gmail.com>",
      order: null,
    })

    expect(r.hasAccess).toBe(true)
    expect(r.details).toContain("Profit Dashboard")
    expect(r.details).toMatch(/member/i)
    expect(r.details).toContain("251")
    // Never leak the address / phone the API also returns.
    expect(r.details).not.toContain("ater road")
    expect(r.details).not.toContain("9977176638")

    // Sends the bare, lowercased address + the api-key header.
    const init = fetchMock.mock.calls[0]?.[1] as {
      body: string
      headers: Record<string, string>
    }
    expect(JSON.parse(init.body)).toEqual({ email: "madhav5448@gmail.com" })
    expect(init.headers["x-api-key"]).toBe("test-key")
  })

  it("checkAccess returns no-access when the user is not found", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: true, data: { exists: false } }))
    const r = await getAdapter("profitdashboard").checkAccess({
      email: "x@y.com",
      order: null,
    })
    expect(r.hasAccess).toBe(false)
    expect(r.details).toBeNull()
  })

  it("lookupOrder returns no orders (access-only API)", async () => {
    const r = await getAdapter("profitdashboard").lookupOrder({
      email: "x@y.com",
    })
    expect(r).toEqual({ found: false, orders: [] })
  })

  it("issueRefund is unsupported (membership API can't move money)", async () => {
    const r = await getAdapter("profitdashboard").issueRefund({
      orderId: null,
      customerEmail: "x@y.com",
      amount: null,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/refund/i)
  })

  it("throws on a non-OK response so enrichment degrades to no-context", async () => {
    vi.stubGlobal("fetch", mockFetch({}, false, 500))
    await expect(
      getAdapter("profitdashboard").checkAccess({
        email: "x@y.com",
        order: null,
      })
    ).rejects.toThrow(/profitdashboard_lookup_failed/)
  })
})

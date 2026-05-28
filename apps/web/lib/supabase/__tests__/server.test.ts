import { describe, it, expect, vi, beforeEach } from "vitest"

// server-only throws outside Next.js server context; mock it for unit tests
vi.mock("server-only", () => ({}))

// Provide env vars required by buildClient
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key"

// Mock next/headers cookies()
const mockGetAll = vi.fn().mockReturnValue([
  { name: "sb-test-auth-token", value: "abc" },
])
const mockSet = vi.fn()
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: mockGetAll, set: mockSet }),
}))

// Mock @supabase/ssr.createServerClient
const mockGetUser = vi.fn()
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}))

import { getActionSupabase, getAnonActionSupabase } from "../server.js"

describe("getActionSupabase", () => {
  beforeEach(() => {
    mockGetUser.mockReset()
  })

  it("returns { supabase, user } when authenticated", async () => {
    const user = { id: "u-1", email: "alice@example.com" }
    mockGetUser.mockResolvedValue({ data: { user }, error: null })
    const result = await getActionSupabase()
    expect(result.user).toEqual(user)
    expect(result.supabase).toBeDefined()
  })

  it("throws when no authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(getActionSupabase()).rejects.toThrow(/not authenticated/i)
  })

  it("throws when supabase.auth.getUser returns an error", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("network") })
    await expect(getActionSupabase()).rejects.toThrow()
  })
})

describe("getAnonActionSupabase", () => {
  it("returns supabase without requiring a user", async () => {
    const result = await getAnonActionSupabase()
    expect(result.supabase).toBeDefined()
  })
})

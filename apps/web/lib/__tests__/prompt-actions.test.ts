import { describe, it, expect, vi, beforeEach } from "vitest"

let callerRole = "admin"
const updateSpy = vi.fn()

function makeAdmin() {
  const make = (table: string) => {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.update = vi.fn((p: Record<string, unknown>) => {
      updateSpy(p)
      return b
    })
    b.eq = vi.fn(() => b)
    b.single = vi.fn(async () => {
      if (table === "profiles") return { data: { role: callerRole }, error: null }
      if (table === "prompt_configs") return { data: { version: 2 }, error: null }
      return { data: null, error: null }
    })
    b.then = (resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null })
    return b
  }
  return { from: vi.fn((t: string) => make(t)) }
}

vi.mock("@/lib/supabase/server", () => ({
  getActionSupabase: async () => ({
    user: { id: "u1", email: "admin@example.com" },
    supabase: {},
  }),
}))
let adminClient: ReturnType<typeof makeAdmin>
vi.mock("@/lib/supabase/admin", () => ({
  getServerSupabase: () => adminClient,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { updatePrompt } from "../prompt-actions.js"

function form(obj: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(obj)) f.set(k, v)
  return f
}

describe("updatePrompt", () => {
  beforeEach(() => {
    callerRole = "admin"
    updateSpy.mockReset()
    adminClient = makeAdmin()
  })

  it("rejects non-admins (the real security boundary)", async () => {
    callerRole = "operator"
    const r = await updatePrompt(form({ id: "p1", content: "new content" }))
    expect(r.error).toBe(true)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("updates content and bumps the version for an admin", async () => {
    const r = await updatePrompt(form({ id: "p1", content: "new content" }))
    expect(r.error).toBe(false)
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ content: "new content", version: 3 })
    )
  })

  it("rejects empty content", async () => {
    const r = await updatePrompt(form({ id: "p1", content: "   " }))
    expect(r.error).toBe(true)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

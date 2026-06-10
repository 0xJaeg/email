import { describe, it, expect, vi, beforeEach } from "vitest"

let callerRole = "admin"
const insertSpy = vi.fn()
const deleteSpy = vi.fn()

function makeAdmin() {
  const make = (table: string) => {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.insert = vi.fn((p: unknown) => {
      insertSpy(p)
      return b
    })
    b.update = vi.fn(() => b)
    b.delete = vi.fn(() => {
      deleteSpy()
      return b
    })
    b.eq = vi.fn(() => b)
    b.single = vi.fn(async () => {
      if (table === "profiles") return { data: { role: callerRole }, error: null }
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
    user: { id: "u1", email: "a@example.com" },
    supabase: {},
  }),
}))
let adminClient: ReturnType<typeof makeAdmin>
vi.mock("@/lib/supabase/admin", () => ({ getServerSupabase: () => adminClient }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { createTrigger, deleteTrigger } from "../trigger-actions.js"

function form(obj: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(obj)) f.set(k, v)
  return f
}

const valid = { product_id: "prod-1", after_n_requests: "3", is_active: "active" }

describe("trigger-actions", () => {
  beforeEach(() => {
    callerRole = "admin"
    insertSpy.mockReset()
    deleteSpy.mockReset()
    adminClient = makeAdmin()
  })

  it("createTrigger rejects non-admins", async () => {
    callerRole = "operator"
    const r = await createTrigger(form(valid))
    expect(r.error).toBe(true)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("createTrigger inserts an issue_refund trigger with the threshold", async () => {
    const r = await createTrigger(form(valid))
    expect(r.error).toBe(false)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: "prod-1",
        action: "issue_refund",
        condition: { after_n_requests: 3 },
        is_active: true,
      })
    )
  })

  it("createTrigger rejects a non-positive threshold", async () => {
    const r = await createTrigger(form({ ...valid, after_n_requests: "0" }))
    expect(r.error).toBe(true)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("deleteTrigger deletes for an admin", async () => {
    const r = await deleteTrigger("trg-1")
    expect(r.error).toBe(false)
    expect(deleteSpy).toHaveBeenCalled()
  })
})

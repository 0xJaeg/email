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

import { createInbox, deleteInbox } from "../inbox-actions.js"

function form(obj: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(obj)) f.set(k, v)
  return f
}

const valid = {
  product_id: "prod-1",
  agent_mail_inbox_id: "support@agentmail.to",
  address: "support@example.com",
  is_active: "active",
}

describe("inbox-actions", () => {
  beforeEach(() => {
    callerRole = "admin"
    insertSpy.mockReset()
    deleteSpy.mockReset()
    adminClient = makeAdmin()
  })

  it("createInbox rejects non-admins", async () => {
    callerRole = "operator"
    const r = await createInbox(form(valid))
    expect(r.error).toBe(true)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("createInbox inserts a valid inbox", async () => {
    const r = await createInbox(form(valid))
    expect(r.error).toBe(false)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: "prod-1",
        agent_mail_inbox_id: "support@agentmail.to",
        is_active: true,
      })
    )
  })

  it("createInbox rejects a missing inbox id", async () => {
    const r = await createInbox(form({ ...valid, agent_mail_inbox_id: "" }))
    expect(r.error).toBe(true)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("deleteInbox deletes for an admin", async () => {
    const r = await deleteInbox("ibx-1")
    expect(r.error).toBe(false)
    expect(deleteSpy).toHaveBeenCalled()
  })
})

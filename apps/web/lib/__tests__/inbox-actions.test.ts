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

// Mock the AgentMail create helper
const createAgentMailInboxSpy = vi.fn()
vi.mock("@workspace/actions/agent-mail", () => ({
  createAgentMailInbox: (...args: unknown[]) => createAgentMailInboxSpy(...args),
}))

import { createInbox, deleteInbox } from "../inbox-actions.js"

function form(obj: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(obj)) f.set(k, v)
  return f
}

const valid = {
  product_id: "prod-1",
  username: "support",
  display_name: "Support Inbox",
  is_active: "active",
}

describe("inbox-actions", () => {
  beforeEach(() => {
    callerRole = "admin"
    insertSpy.mockReset()
    deleteSpy.mockReset()
    adminClient = makeAdmin()
    createAgentMailInboxSpy.mockReset()
    createAgentMailInboxSpy.mockResolvedValue({ inboxId: "support@agentmail.to" })
  })

  it("createInbox rejects non-admins", async () => {
    callerRole = "operator"
    const r = await createInbox(form(valid))
    expect(r.error).toBe(true)
    expect(createAgentMailInboxSpy).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("createInbox calls AgentMail with username and displayName then inserts with the returned inboxId", async () => {
    const r = await createInbox(form(valid))
    expect(r.error).toBe(false)
    expect(createAgentMailInboxSpy).toHaveBeenCalledWith({
      username: "support",
      displayName: "Support Inbox",
    })
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: "prod-1",
        agent_mail_inbox_id: "support@agentmail.to",
        address: "support@agentmail.to",
        is_active: true,
      })
    )
  })

  it("createInbox returns an error and does NOT insert when AgentMail throws", async () => {
    createAgentMailInboxSpy.mockRejectedValue(new Error("API quota exceeded"))
    const r = await createInbox(form(valid))
    expect(r.error).toBe(true)
    expect(r.message).toMatch(/API quota exceeded/)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("createInbox rejects a missing username", async () => {
    const r = await createInbox(form({ ...valid, username: "" }))
    expect(r.error).toBe(true)
    expect(createAgentMailInboxSpy).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("createInbox rejects a missing display name", async () => {
    const r = await createInbox(form({ ...valid, display_name: "" }))
    expect(r.error).toBe(true)
    expect(createAgentMailInboxSpy).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("createInbox rejects a missing product", async () => {
    const r = await createInbox(form({ ...valid, product_id: "" }))
    expect(r.error).toBe(true)
    expect(createAgentMailInboxSpy).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("deleteInbox deletes for an admin", async () => {
    const r = await deleteInbox("ibx-1")
    expect(r.error).toBe(false)
    expect(deleteSpy).toHaveBeenCalled()
  })
})

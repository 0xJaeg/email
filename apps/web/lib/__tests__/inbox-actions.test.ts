import { describe, it, expect, vi, beforeEach } from "vitest"

let callerRole = "admin"
const upsertSpy = vi.fn()
const deleteSpy = vi.fn()

function makeAdmin() {
  const make = (table: string) => {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.upsert = vi.fn((p: unknown, opts: unknown) => {
      upsertSpy(p, opts)
      return b
    })
    b.update = vi.fn(() => b)
    b.delete = vi.fn(() => {
      deleteSpy()
      return b
    })
    b.eq = vi.fn(() => b)
    b.single = vi.fn(async () => {
      if (table === "profiles")
        return { data: { role: callerRole }, error: null }
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
vi.mock("@/lib/supabase/admin", () => ({
  getServerSupabase: () => adminClient,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

// Mock the AgentMail create helper — returns { inboxId, created }.
const createAgentMailInboxSpy = vi.fn()
vi.mock("@workspace/actions/agent-mail", () => ({
  createAgentMailInbox: (...args: unknown[]) =>
    createAgentMailInboxSpy(...args),
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
    upsertSpy.mockReset()
    deleteSpy.mockReset()
    adminClient = makeAdmin()
    createAgentMailInboxSpy.mockReset()
    createAgentMailInboxSpy.mockResolvedValue({
      inboxId: "support@agentmail.to",
      created: true,
    })
  })

  it("createInbox rejects non-admins", async () => {
    callerRole = "operator"
    const r = await createInbox(form(valid))
    expect(r.error).toBe(true)
    expect(createAgentMailInboxSpy).not.toHaveBeenCalled()
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it("createInbox calls AgentMail then upserts with the returned inboxId", async () => {
    const r = await createInbox(form(valid))
    expect(r.error).toBe(false)
    expect(r.message).toBe("Inbox created.")
    expect(createAgentMailInboxSpy).toHaveBeenCalledWith({
      username: "support",
      displayName: "Support Inbox",
    })
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: "prod-1",
        agent_mail_inbox_id: "support@agentmail.to",
        is_active: true,
      }),
      expect.objectContaining({ onConflict: "agent_mail_inbox_id" })
    )
  })

  it("createInbox returns 'Linked existing Agent Mail inbox.' when created is false", async () => {
    createAgentMailInboxSpy.mockResolvedValue({
      inboxId: "support@agentmail.to",
      created: false,
    })
    const r = await createInbox(form(valid))
    expect(r.error).toBe(false)
    expect(r.message).toBe("Linked existing Agent Mail inbox.")
  })

  it("createInbox returns an error and does NOT upsert when AgentMail throws", async () => {
    createAgentMailInboxSpy.mockRejectedValue(new Error("API quota exceeded"))
    const r = await createInbox(form(valid))
    expect(r.error).toBe(true)
    expect(r.message).toMatch(/API quota exceeded/)
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it("createInbox rejects a missing username", async () => {
    const r = await createInbox(form({ ...valid, username: "" }))
    expect(r.error).toBe(true)
    expect(createAgentMailInboxSpy).not.toHaveBeenCalled()
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it("createInbox rejects a missing display name", async () => {
    const r = await createInbox(form({ ...valid, display_name: "" }))
    expect(r.error).toBe(true)
    expect(createAgentMailInboxSpy).not.toHaveBeenCalled()
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it("createInbox rejects a missing product", async () => {
    const r = await createInbox(form({ ...valid, product_id: "" }))
    expect(r.error).toBe(true)
    expect(createAgentMailInboxSpy).not.toHaveBeenCalled()
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it("deleteInbox deletes for an admin", async () => {
    const r = await deleteInbox("ibx-1")
    expect(r.error).toBe(false)
    expect(deleteSpy).toHaveBeenCalled()
  })
})

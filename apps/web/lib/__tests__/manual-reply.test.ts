import { describe, it, expect, vi, beforeEach } from "vitest"

const updateSpy = vi.fn()
const auditSpy = vi.fn()
let emailRow: Record<string, unknown> | null = null
let decisionRow: Record<string, unknown> | null = null

function makeAdmin() {
  const make = (table: string) => {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.eq = vi.fn(() => b)
    b.order = vi.fn(() => b)
    b.limit = vi.fn(() => b)
    b.update = vi.fn((p: unknown) => {
      if (table === "decisions") updateSpy(p)
      return b
    })
    b.insert = vi.fn((p: unknown) => {
      if (table === "audit_log") auditSpy(p)
      return b
    })
    b.maybeSingle = vi.fn(async () => {
      if (table === "emails") return { data: emailRow, error: null }
      if (table === "decisions") return { data: decisionRow, error: null }
      return { data: null, error: null }
    })
    b.then = (resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null })
    return b
  }
  return { from: vi.fn((t: string) => make(t)) }
}

let adminClient: ReturnType<typeof makeAdmin>
vi.mock("@/lib/supabase/admin", () => ({
  getServerSupabase: () => adminClient,
}))
vi.mock("@/lib/supabase/server", () => ({
  getActionSupabase: async () => ({
    user: { id: "u1", email: "op@example.com" },
  }),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const sendReplySpy = vi.fn()
vi.mock("@workspace/actions/send-reply", () => ({
  sendReply: (...a: unknown[]) => sendReplySpy(...a),
}))

const resolveInboxSpy = vi.fn()
vi.mock("@/lib/sender-inbox", () => ({
  resolveSenderInbox: (...a: unknown[]) => resolveInboxSpy(...a),
}))

import { sendManualReply } from "../manual-reply.js"

describe("sendManualReply", () => {
  beforeEach(() => {
    updateSpy.mockReset()
    auditSpy.mockReset()
    adminClient = makeAdmin()
    emailRow = {
      id: "em-1",
      agent_mail_message_id: "msg_abc",
      from_email: "cust@example.com",
      subject: "Help",
    }
    decisionRow = { id: "dec-1" }
    sendReplySpy.mockReset().mockResolvedValue({
      ok: true,
      sentMessageId: "msg_sent",
    })
    resolveInboxSpy.mockReset().mockResolvedValue("inbox_x")
  })

  it("sends from the thread's inbox, records the reply on the decision, audits", async () => {
    const r = await sendManualReply("thr-1", "Here is your answer.")
    expect(r.error).toBe(false)
    expect(resolveInboxSpy).toHaveBeenCalledWith(expect.anything(), "thr-1")
    expect(sendReplySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxId: "inbox_x",
        inReplyToMessageId: "msg_abc",
        replyText: "Here is your answer.",
        to: "cust@example.com",
        emailId: "em-1",
        decisionId: "dec-1",
        subject: "Re: Help",
      })
    )
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        draft_reply_text: "Here is your answer.",
        approved_by: "op@example.com",
      })
    )
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: "manual_reply" })
    )
  })

  it("rejects an empty reply", async () => {
    const r = await sendManualReply("thr-1", "   ")
    expect(r.error).toBe(true)
    expect(sendReplySpy).not.toHaveBeenCalled()
  })

  it("errors when there's no customer message to reply to", async () => {
    emailRow = null
    const r = await sendManualReply("thr-1", "hi")
    expect(r.error).toBe(true)
    expect(sendReplySpy).not.toHaveBeenCalled()
  })

  it("fails loudly when the thread has no registered inbox", async () => {
    resolveInboxSpy.mockRejectedValue(
      new Error("no_sender_inbox: add it in Inboxes")
    )
    const r = await sendManualReply("thr-1", "hi")
    expect(r.error).toBe(true)
    expect(r.message).toMatch(/no_sender_inbox/)
    expect(sendReplySpy).not.toHaveBeenCalled()
  })

  it("surfaces a send failure and does not mark the decision sent", async () => {
    sendReplySpy.mockResolvedValue({ ok: false, error: "AgentMail down" })
    const r = await sendManualReply("thr-1", "hi")
    expect(r.error).toBe(true)
    expect(r.message).toBe("AgentMail down")
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

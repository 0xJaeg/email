import { describe, it, expect, vi, beforeEach } from "vitest"
import { sendReply } from "../sendReply.js"
import type { ServerClient } from "@workspace/db/client"

function mockSupabase() {
  const auditInsert = vi.fn().mockResolvedValue({ data: null, error: null })
  const supabase = {
    from: vi.fn(() => ({ insert: auditInsert })),
  } as unknown as ServerClient
  return { supabase, auditInsert }
}

const mockReply = vi.fn()
const mockSend = vi.fn()
vi.mock("../agent-mail.js", () => ({
  getAgentMailClient: () => ({
    inboxes: {
      messages: {
        reply: (...args: unknown[]) => mockReply(...args),
        send: (...args: unknown[]) => mockSend(...args),
      },
    },
  }),
}))

const base = {
  inboxId: "inbox_test",
  decisionId: "decision-1",
  emailId: "email-1",
  to: "customer@example.com",
  subject: "Re: Refund",
}

describe("sendReply", () => {
  beforeEach(() => {
    mockReply.mockReset()
    mockSend.mockReset()
  })

  it("threads via reply() for a real msg_ id, returns sentMessageId", async () => {
    mockReply.mockResolvedValue({ messageId: "msg_sent_42" })
    const { supabase } = mockSupabase()
    const result = await sendReply({
      ...base,
      inReplyToMessageId: "msg_in_99",
      replyText: "Hi — refund issued, you'll see $97 back within 3–5 days.",
      supabase,
    })
    expect(mockReply).toHaveBeenCalledWith(
      "inbox_test",
      "msg_in_99",
      expect.objectContaining({ text: expect.any(String) })
    )
    expect(mockSend).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, sentMessageId: "msg_sent_42" })
  })

  it("audits success with email_id, the sent reply_text, and via:reply", async () => {
    mockReply.mockResolvedValue({ messageId: "msg_sent_42" })
    const { supabase, auditInsert } = mockSupabase()
    await sendReply({
      ...base,
      inReplyToMessageId: "msg_in_99",
      replyText: "Your refund is on its way.",
      supabase,
    })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "send_reply",
        status: "success",
        email_id: "email-1",
        payload: expect.objectContaining({
          decision_id: "decision-1",
          sent_message_id: "msg_sent_42",
          in_reply_to: "msg_in_99",
          via: "reply",
          reply_text: "Your refund is on its way.",
        }),
      })
    )
  })

  it("falls back to send() (new message) for a simulated/non-msg_ id", async () => {
    mockSend.mockResolvedValue({ messageId: "msg_sent_77" })
    const { supabase, auditInsert } = mockSupabase()
    const result = await sendReply({
      ...base,
      inReplyToMessageId: "<sim-abc@sim.local>",
      replyText: "Here's your password reset link…",
      to: "rachel@example.com",
      subject: "Re: Can't log in",
      supabase,
    })
    expect(mockSend).toHaveBeenCalledWith(
      "inbox_test",
      expect.objectContaining({
        to: ["rachel@example.com"],
        subject: "Re: Can't log in",
        text: expect.any(String),
      })
    )
    expect(mockReply).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, sentMessageId: "msg_sent_77" })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "send_reply",
        status: "success",
        email_id: "email-1",
        payload: expect.objectContaining({ via: "send" }),
      })
    )
  })

  it("falls back to send() when there is no message id (empty string)", async () => {
    mockSend.mockResolvedValue({ messageId: "msg_sent_78" })
    const { supabase } = mockSupabase()
    await sendReply({
      ...base,
      inReplyToMessageId: "",
      replyText: "ok",
      to: "sam@example.com",
      subject: "Re: Billing",
      supabase,
    })
    expect(mockSend).toHaveBeenCalled()
    expect(mockReply).not.toHaveBeenCalled()
  })

  it("returns ok:false and audits failure when AgentMail throws", async () => {
    mockReply.mockRejectedValueOnce(new Error("rate limited"))
    const { supabase, auditInsert } = mockSupabase()
    const result = await sendReply({
      ...base,
      inReplyToMessageId: "msg_in_99",
      replyText: "ok",
      supabase,
    })
    expect(result).toEqual({ ok: false, error: "rate limited" })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "send_reply",
        status: "failure",
        email_id: "email-1",
        error: "rate limited",
      })
    )
  })
})

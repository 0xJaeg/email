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
vi.mock("../agent-mail.js", () => ({
  getAgentMailClient: () => ({
    inboxes: {
      messages: {
        reply: (...args: unknown[]) => mockReply(...args),
      },
    },
  }),
  getAgentMailInboxId: () => "inbox_test",
}))

describe("sendReply", () => {
  beforeEach(() => mockReply.mockReset())

  it("calls AgentMail reply with inboxId + inReplyToMessageId + text, returns sentMessageId", async () => {
    mockReply.mockResolvedValue({ messageId: "msg_sent_42" })
    const { supabase } = mockSupabase()
    const result = await sendReply({
      inboxId: "inbox_test",
      inReplyToMessageId: "msg_in_99",
      replyText: "Hi — refund issued, you'll see $97 back within 3–5 days.",
      decisionId: "decision-1",
      supabase,
    })
    expect(mockReply).toHaveBeenCalledWith(
      "inbox_test",
      "msg_in_99",
      expect.objectContaining({ text: expect.any(String) })
    )
    expect(result).toEqual({ ok: true, sentMessageId: "msg_sent_42" })
  })

  it("audits success", async () => {
    mockReply.mockResolvedValue({ messageId: "msg_sent_42" })
    const { supabase, auditInsert } = mockSupabase()
    await sendReply({
      inboxId: "inbox_test",
      inReplyToMessageId: "msg_in_99",
      replyText: "ok",
      decisionId: "decision-1",
      supabase,
    })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "send_reply",
        status: "success",
        payload: expect.objectContaining({
          decision_id: "decision-1",
          sent_message_id: "msg_sent_42",
          in_reply_to: "msg_in_99",
        }),
      })
    )
  })

  it("returns ok:false and audits failure when AgentMail throws", async () => {
    mockReply.mockRejectedValueOnce(new Error("rate limited"))
    const { supabase, auditInsert } = mockSupabase()
    const result = await sendReply({
      inboxId: "inbox_test",
      inReplyToMessageId: "msg_in_99",
      replyText: "ok",
      decisionId: "decision-1",
      supabase,
    })
    expect(result).toEqual({ ok: false, error: "rate limited" })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "send_reply",
        status: "failure",
        error: "rate limited",
      })
    )
  })
})

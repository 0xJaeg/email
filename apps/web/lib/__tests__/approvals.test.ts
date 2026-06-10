import { describe, it, expect, vi, beforeEach } from "vitest"

// Chainable Supabase stub. The claim returns `claimed` from maybeSingle();
// terminal status updates / audit inserts are awaited directly (thenable).
function makeServerSupabase(
  claimed: Record<string, unknown> | null,
  routing?: {
    thread?: { inbox_id?: string | null; product_id?: string | null }
    inbox?: { agent_mail_inbox_id: string }
    product?: { adapter_key: string }
  }
) {
  const make = (table: string) => {
    const b: Record<string, unknown> = {}
    b.update = vi.fn(() => b)
    b.insert = vi.fn(() => b)
    b.select = vi.fn(() => b)
    b.eq = vi.fn(() => b)
    b.maybeSingle = vi.fn(async () => {
      if (table === "threads")
        return { data: routing?.thread ?? null, error: null }
      if (table === "inboxes")
        return { data: routing?.inbox ?? null, error: null }
      if (table === "products")
        return { data: routing?.product ?? null, error: null }
      return { data: claimed, error: null }
    })
    b.then = (resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null })
    return b
  }
  return { from: vi.fn((t: string) => make(t)) }
}

let serverSupabase: ReturnType<typeof makeServerSupabase>
vi.mock("@/lib/supabase/admin", () => ({
  getServerSupabase: () => serverSupabase,
}))
vi.mock("@/lib/supabase/server", () => ({
  getActionSupabase: async () => ({
    user: { email: "operator@example.com", id: "u1" },
    supabase: {},
  }),
}))

const mockSendReply = vi.fn()
vi.mock("@workspace/actions/send-reply", () => ({
  sendReply: (...a: unknown[]) => mockSendReply(...a),
}))
const mockRefundCustomer = vi.fn()
vi.mock("@workspace/actions/refund-customer", () => ({
  refundCustomer: (...a: unknown[]) => mockRefundCustomer(...a),
}))
const mockSuppressContact = vi.fn()
vi.mock("@workspace/actions/suppress-contact", () => ({
  suppressContact: (...a: unknown[]) => mockSuppressContact(...a),
}))
vi.mock("@workspace/actions/agent-mail", () => ({
  getAgentMailInboxId: () => "inbox_test",
}))

import { approveDecision, rejectDecision } from "../approvals.js"

const emails = {
  id: "email-1",
  from_email: "jordan@example.com",
  subject: "Where do I download?",
  agent_mail_message_id: "msg_1",
  body_text: "I can't find my download.",
  thread_id: "th-1",
}

describe("approveDecision", () => {
  beforeEach(() => {
    mockSendReply.mockReset().mockResolvedValue({
      ok: true,
      sentMessageId: "msg_sent",
    })
    mockRefundCustomer.mockReset().mockResolvedValue({
      ok: true,
      refundId: "rf_1",
    })
    mockSuppressContact.mockReset().mockResolvedValue({ ok: true })
  })

  it("for a reply decision, sends the reply and does NOT issue a refund", async () => {
    serverSupabase = makeServerSupabase({
      id: "dec-1",
      decision: "send_faq_reply",
      draft_reply_text: "Hi Jordan — here's your download link…",
      emails,
    })
    await approveDecision("dec-1")
    expect(mockRefundCustomer).not.toHaveBeenCalled()
    expect(mockSendReply).toHaveBeenCalledTimes(1)
  })

  it("sends the operator's edited text when an edit is provided", async () => {
    serverSupabase = makeServerSupabase({
      id: "dec-1b",
      decision: "send_faq_reply",
      draft_reply_text: "Original draft.",
      emails,
    })
    await approveDecision("dec-1b", "Operator-polished reply.")
    expect(mockSendReply).toHaveBeenCalledWith(
      expect.objectContaining({ replyText: "Operator-polished reply." })
    )
  })

  it("sends the original draft when the edit is unchanged/blank", async () => {
    serverSupabase = makeServerSupabase({
      id: "dec-1c",
      decision: "send_faq_reply",
      draft_reply_text: "Original draft.",
      emails,
    })
    await approveDecision("dec-1c", "   ")
    expect(mockSendReply).toHaveBeenCalledWith(
      expect.objectContaining({ replyText: "Original draft." })
    )
  })

  it("for a refund decision, issues the refund (default mock adapter) then sends", async () => {
    serverSupabase = makeServerSupabase({
      id: "dec-2",
      proposed_actions: [{ type: "issue_refund" }],
      draft_reply_text: "Your refund is on its way.",
      emails,
    })
    await approveDecision("dec-2")
    expect(mockRefundCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ adapterKey: "mock" })
    )
    expect(mockSendReply).toHaveBeenCalledTimes(1)
  })

  it("resolves the refund adapter from the thread's product", async () => {
    serverSupabase = makeServerSupabase(
      {
        id: "dec-6",
        proposed_actions: [{ type: "issue_refund" }],
        draft_reply_text: "Your refund is on its way.",
        emails,
      },
      {
        thread: { product_id: "prod-1" },
        product: { adapter_key: "clickbank" },
      }
    )
    await approveDecision("dec-6")
    expect(mockRefundCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ adapterKey: "clickbank" })
    )
  })

  it("executes suppress_contact alongside the refund", async () => {
    serverSupabase = makeServerSupabase({
      id: "dec-7",
      proposed_actions: [
        { type: "issue_refund" },
        { type: "suppress_contact", reason: "refund" },
      ],
      draft_reply_text: "Your refund is on its way.",
      emails,
    })
    await approveDecision("dec-7")
    expect(mockRefundCustomer).toHaveBeenCalledTimes(1)
    expect(mockSuppressContact).toHaveBeenCalledWith(
      expect.objectContaining({ email: "jordan@example.com", reason: "refund" })
    )
    expect(mockSendReply).toHaveBeenCalledTimes(1)
  })

  it("sends from the thread's routed inbox when one is set", async () => {
    serverSupabase = makeServerSupabase(
      {
        id: "dec-5",
        decision: "send_faq_reply",
        draft_reply_text: "Hi…",
        emails,
      },
      {
        thread: { inbox_id: "ibx-1" },
        inbox: { agent_mail_inbox_id: "inbox_routed" },
      }
    )
    await approveDecision("dec-5")
    expect(mockSendReply).toHaveBeenCalledWith(
      expect.objectContaining({ inboxId: "inbox_routed" })
    )
  })

  it("is a no-op when the decision was already handled (claim returns nothing)", async () => {
    serverSupabase = makeServerSupabase(null)
    await approveDecision("dec-3")
    expect(mockRefundCustomer).not.toHaveBeenCalled()
    expect(mockSendReply).not.toHaveBeenCalled()
  })
})

describe("rejectDecision", () => {
  it("claims and rejects without sending or refunding", async () => {
    serverSupabase = makeServerSupabase({ id: "dec-4" })
    await rejectDecision("dec-4", "not warranted")
    expect(mockSendReply).not.toHaveBeenCalled()
    expect(mockRefundCustomer).not.toHaveBeenCalled()
  })
})

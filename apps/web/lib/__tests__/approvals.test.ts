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
      // Default to a registered inbox so the happy path resolves a sender;
      // tests override (e.g. thread.inbox_id: null) to hit the fail-loud path.
      if (table === "threads")
        return { data: { inbox_id: "ibx-1", ...routing?.thread }, error: null }
      if (table === "inboxes")
        return {
          data: routing?.inbox ?? { agent_mail_inbox_id: "inbox_default" },
          error: null,
        }
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

// approveDecision now ENQUEUES the reply to the sends queue (the worker sends it
// asynchronously, after an optional per-node delay) instead of sending inline.
// Mock the queue so the real server-only producer isn't imported in the test.
const mockEnqueue = vi.fn()
vi.mock("@/lib/queue", () => ({
  getSendsQueue: () => ({ add: mockEnqueue }),
}))
const mockRefundCustomer = vi.fn()
vi.mock("@workspace/actions/refund-customer", () => ({
  refundCustomer: (...a: unknown[]) => mockRefundCustomer(...a),
}))
const mockSuppressContact = vi.fn()
vi.mock("@workspace/actions/suppress-contact", () => ({
  suppressContact: (...a: unknown[]) => mockSuppressContact(...a),
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
    mockEnqueue.mockReset()
    mockRefundCustomer.mockReset().mockResolvedValue({
      ok: true,
      refundId: "rf_1",
    })
    mockSuppressContact.mockReset().mockResolvedValue({ ok: true })
  })

  it("for a reply decision, enqueues the reply and does NOT issue a refund", async () => {
    serverSupabase = makeServerSupabase({
      id: "dec-1",
      decision: "send_faq_reply",
      draft_reply_text: "Hi Jordan — here's your download link…",
      emails,
    })
    await approveDecision("dec-1")
    expect(mockRefundCustomer).not.toHaveBeenCalled()
    expect(mockEnqueue).toHaveBeenCalledTimes(1)
  })

  it("enqueues the operator's edited text when an edit is provided", async () => {
    serverSupabase = makeServerSupabase({
      id: "dec-1b",
      decision: "send_faq_reply",
      draft_reply_text: "Original draft.",
      emails,
    })
    await approveDecision("dec-1b", "Operator-polished reply.")
    expect(mockEnqueue).toHaveBeenCalledWith(
      "send_reply",
      expect.objectContaining({ replyText: "Operator-polished reply." }),
      expect.anything()
    )
  })

  it("enqueues the original draft when the edit is unchanged/blank", async () => {
    serverSupabase = makeServerSupabase({
      id: "dec-1c",
      decision: "send_faq_reply",
      draft_reply_text: "Original draft.",
      emails,
    })
    await approveDecision("dec-1c", "   ")
    expect(mockEnqueue).toHaveBeenCalledWith(
      "send_reply",
      expect.objectContaining({ replyText: "Original draft." }),
      expect.anything()
    )
  })

  it("for a refund decision, issues the refund (default mock adapter) then enqueues", async () => {
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
    expect(mockEnqueue).toHaveBeenCalledTimes(1)
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
    expect(mockEnqueue).toHaveBeenCalledTimes(1)
  })

  it("enqueues from the thread's routed inbox when one is set", async () => {
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
    expect(mockEnqueue).toHaveBeenCalledWith(
      "send_reply",
      expect.objectContaining({ inboxId: "inbox_routed" }),
      expect.anything()
    )
  })

  it("fails the send (no global fallback) when the thread has no registered inbox", async () => {
    serverSupabase = makeServerSupabase(
      {
        id: "dec-8",
        decision: "send_faq_reply",
        draft_reply_text: "Hi…",
        emails,
      },
      { thread: { inbox_id: null } }
    )
    await approveDecision("dec-8")
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it("schedules the reply with a delay from the decision's send_delay range", async () => {
    serverSupabase = makeServerSupabase({
      id: "dec-9",
      decision: "send_faq_reply",
      draft_reply_text: "Hi…",
      context: { send_delay: { min: 5, max: 5 } },
      emails,
    })
    await approveDecision("dec-9")
    expect(mockEnqueue).toHaveBeenCalledWith("send_reply", expect.any(Object), {
      delay: 5 * 60_000,
    })
  })

  it("is a no-op when the decision was already handled (claim returns nothing)", async () => {
    serverSupabase = makeServerSupabase(null)
    await approveDecision("dec-3")
    expect(mockRefundCustomer).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })
})

describe("rejectDecision", () => {
  it("claims and rejects without enqueuing or refunding", async () => {
    serverSupabase = makeServerSupabase({ id: "dec-4" })
    await rejectDecision("dec-4", "not warranted")
    expect(mockEnqueue).not.toHaveBeenCalled()
    expect(mockRefundCustomer).not.toHaveBeenCalled()
  })
})

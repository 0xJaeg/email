import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Job } from "bullmq"

// A representative inbound FAQ email. body_text drives classification (mocked).
const email = {
  id: "email-1",
  thread_id: "th-1",
  from_email: "jordan@example.com",
  to_email: "support@example.com",
  subject: "Where do I download?",
  body_text: "I bought the course but can't find the download link.",
  agent_mail_message_id: "msg_1",
}

// Per-test routing for resolveProduct + the adapter returned by getAdapter.
let productRow: { product_id: string } | null = null
let productMeta: Record<string, unknown> | null = null
let mockAdapter: {
  key: string
  lookupOrder: () => Promise<unknown>
  checkAccess: () => Promise<unknown>
  issueRefund: () => Promise<unknown>
}

// The default node tree loadGraph() returns in tests: classify -> enrich ->
// decide -> draft (the 4-step pipeline these tests exercise — no spam_filter /
// lookup_gate, so enrich uses the inquiry_type fallback, as before).
const NODES = [
  {
    id: "n_classify",
    node_key: "classify",
    node_type: "classify",
    ai_prompt: null,
    model: null,
    config: {},
    is_start: true,
  },
  {
    id: "n_enrich",
    node_key: "enrich",
    node_type: "enrich",
    ai_prompt: null,
    model: null,
    config: {},
    is_start: false,
  },
  {
    id: "n_decide",
    node_key: "decide",
    node_type: "decide",
    ai_prompt: null,
    model: null,
    config: {},
    is_start: false,
  },
  {
    id: "n_draft",
    node_key: "draft",
    node_type: "draft",
    ai_prompt: null,
    model: null,
    config: {},
    is_start: false,
  },
]
const EDGES = [
  {
    from_node_id: "n_classify",
    to_node_id: "n_enrich",
    outcome: "default",
    position: 0,
  },
  {
    from_node_id: "n_enrich",
    to_node_id: "n_decide",
    outcome: "default",
    position: 0,
  },
  {
    from_node_id: "n_decide",
    to_node_id: "n_draft",
    outcome: "default",
    position: 0,
  },
]

// Minimal chainable Supabase stub that records decision updates + audit inserts.
function makeSupabase() {
  const updates: Record<string, unknown>[] = []
  const audits: Record<string, unknown>[] = []
  const decisionInserts: Record<string, unknown>[] = []
  const make = (table: string) => {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.insert = vi.fn((p: Record<string, unknown>) => {
      if (table === "audit_log") audits.push(p)
      if (table === "decisions") decisionInserts.push(p)
      return b
    })
    b.update = vi.fn((p: Record<string, unknown>) => {
      if (table === "decisions") updates.push(p)
      return b
    })
    b.eq = vi.fn(() => b)
    b.is = vi.fn(() => b)
    b.in = vi.fn(() => b)
    b.order = vi.fn(async () =>
      table === "flow_edges"
        ? { data: EDGES, error: null }
        : { data: [], error: null }
    )
    b.single = vi.fn(async () => {
      if (table === "emails") return { data: email, error: null }
      if (table === "decisions") return { data: { id: "dec-1" }, error: null }
      return { data: null, error: null }
    })
    b.maybeSingle = vi.fn(async () => {
      if (table === "threads") return { data: productRow, error: null }
      if (table === "products") return { data: productMeta, error: null }
      return { data: null, error: null }
    })
    // flow_nodes is awaited directly (no .order); terminal inserts/updates too.
    b.then = (resolve: (v: unknown) => void) =>
      resolve(
        table === "flow_nodes"
          ? { data: NODES, error: null }
          : { data: null, error: null }
      )
    return b
  }
  return {
    supabase: { from: vi.fn((t: string) => make(t)) },
    updates,
    audits,
    decisionInserts,
  }
}

const store = makeSupabase()

const mockParse = vi.fn()
vi.mock("../../lib/anthropic.js", () => ({
  getAnthropic: () => ({
    messages: { parse: (...a: unknown[]) => mockParse(...a) },
  }),
}))
vi.mock("../../lib/supabase.js", () => ({ getSupabase: () => store.supabase }))

const mockGenerateReply = vi.fn()
vi.mock("../../lib/generate-reply.js", () => ({
  generateReply: (...a: unknown[]) => mockGenerateReply(...a),
}))

const mockDecideRefund = vi.fn()
vi.mock("../../lib/refund-decision.js", () => ({
  decideRefund: (...a: unknown[]) => mockDecideRefund(...a),
}))

const mockSendReply = vi.fn()
vi.mock("@workspace/actions", () => ({
  sendReply: (...a: unknown[]) => mockSendReply(...a),
  getAgentMailInboxId: () => "inbox_test",
  getAdapter: () => mockAdapter,
}))

import { processEmail } from "../email.js"

const job = { id: "job-1", data: { emailId: "email-1" } } as unknown as Job

describe("processEmail", () => {
  beforeEach(() => {
    store.updates.length = 0
    store.audits.length = 0
    store.decisionInserts.length = 0
    mockDecideRefund.mockReset()
    productRow = null
    productMeta = null
    mockAdapter = {
      key: "mock",
      lookupOrder: async () => ({
        found: true,
        orders: [
          {
            orderId: "O-1",
            productName: "Pro Course",
            amount: 97,
            currency: "USD",
            purchasedAt: "2026-05-01",
          },
        ],
      }),
      checkAccess: async () => ({
        hasAccess: true,
        details: "Login at https://members.example.com",
      }),
      issueRefund: async () => ({ ok: true, refundId: "r" }),
    }
    mockSendReply.mockReset()
    mockGenerateReply.mockReset().mockResolvedValue({
      text: "Hi Jordan — here's your download link…",
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    })
    mockParse.mockReset().mockResolvedValue({
      parsed_output: {
        classification: "faq",
        reasoning: "operational how-to question",
      },
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 4844,
        cache_creation_input_tokens: 0,
      },
    })
  })

  it("does NOT auto-send a FAQ reply; drafts it and sets pending_approval", async () => {
    await processEmail(job)
    expect(mockSendReply).not.toHaveBeenCalled()
    expect(store.updates).toContainEqual(
      expect.objectContaining({
        status: "pending_approval",
        draft_reply_text: "Hi Jordan — here's your download link…",
      })
    )
  })

  it("audits the drafted reply as reply_pending_approval", async () => {
    await processEmail(job)
    expect(store.audits).toContainEqual(
      expect.objectContaining({ action: "reply_pending_approval" })
    )
  })

  it("for an existing member, gathers context and feeds it to the reply", async () => {
    productRow = { product_id: "prod-1" }
    productMeta = { adapter_key: "mock" }
    mockParse.mockResolvedValue({
      parsed_output: {
        classification: "faq",
        inquiry_type: "existing_member",
        reasoning: "existing member asking for help",
      },
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 4844,
        cache_creation_input_tokens: 0,
      },
    })
    await processEmail(job)
    expect(store.audits).toContainEqual(
      expect.objectContaining({ action: "gather_context" })
    )
    const replyArgs = mockGenerateReply.mock.calls[0]?.[0] as {
      customerContext?: string
    }
    expect(replyArgs.customerContext).toMatch(/O-1|access/i)
  })

  it("for a prospective buyer, does NOT gather context", async () => {
    productRow = { product_id: "prod-1" }
    productMeta = { adapter_key: "mock" }
    mockParse.mockResolvedValue({
      parsed_output: {
        classification: "faq",
        inquiry_type: "prospective_buyer",
        reasoning: "asking about joining",
      },
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 4844,
        cache_creation_input_tokens: 0,
      },
    })
    await processEmail(job)
    expect(store.audits).not.toContainEqual(
      expect.objectContaining({ action: "gather_context" })
    )
    const replyArgs = mockGenerateReply.mock.calls[0]?.[0] as {
      customerContext?: string
    }
    expect(replyArgs.customerContext).toBeUndefined()
  })

  it("for a refund decision, proposes issue_refund + suppress_contact", async () => {
    mockParse.mockResolvedValue({
      parsed_output: {
        classification: "refund_request",
        inquiry_type: "existing_member",
        reasoning: "wants money back",
      },
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 4844,
        cache_creation_input_tokens: 0,
      },
    })
    mockDecideRefund.mockResolvedValue({
      decision: "issue_refund",
      template_used: "REFUND_CONFIRMATION",
      refund_request_count: 2,
      sonnet_usage: null,
    })
    productRow = { product_id: "prod-1" }
    productMeta = { adapter_key: "mock" }
    await processEmail(job)
    expect(store.decisionInserts[0]?.proposed_actions).toEqual([
      { type: "issue_refund" },
      { type: "suppress_contact", reason: "refund" },
    ])
  })

  it("passes the product's configured support facts to the reply", async () => {
    productRow = { product_id: "prod-1" }
    productMeta = {
      adapter_key: "mock",
      name: "Mobile Profits",
      support_config: { login_url: "https://acme.test/login" },
    }
    mockParse.mockResolvedValue({
      parsed_output: {
        classification: "faq",
        inquiry_type: "prospective_buyer",
        reasoning: "asking how to access",
      },
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 4844,
        cache_creation_input_tokens: 0,
      },
    })
    await processEmail(job)
    const replyArgs = mockGenerateReply.mock.calls[0]?.[0] as {
      productFacts?: string
    }
    expect(replyArgs.productFacts).toContain("https://acme.test/login")
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { UnsubscribeCallNode } from "../unsubscribe-call.js"
import type { StepContext, FlowNode } from "../../types.js"

const NODE = {
  id: "n",
  node_key: "unsubscribe_call",
  node_type: "unsubscribe_call",
  ai_prompt: null,
  model: null,
  config: {},
} as FlowNode

function makeCtx() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const ctx = {
    email: { from_email: "jane@example.com" },
    enrichment: null,
    supabase: { from: vi.fn(() => ({ upsert })) },
  } as unknown as StepContext
  return { ctx, upsert }
}

describe("UnsubscribeCallNode", () => {
  beforeEach(() => {
    process.env.MAILWIZZ_API_URL = "https://portal.example.com/api/index.php"
    process.env.MAILWIZZ_API_KEY = "k"
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.APP_ENV
    delete process.env.MAILWIZZ_API_URL
    delete process.env.MAILWIZZ_API_KEY
  })

  it("in development skips the MailWizz call but records the internal opt-out", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock) // APP_ENV unset = development
    const { ctx, upsert } = makeCtx()
    const r = await UnsubscribeCallNode.run(ctx, NODE)
    expect(r.outcome).toBe("skipped")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "jane@example.com",
        reason: "unsubscribe",
      }),
      expect.anything()
    )
    expect(r.enrichment?.context.lookups[0]).toMatchObject({
      adapter: "mailwizz",
      operation: "unsubscribe",
      summary: "skipped (development)",
    })
  })

  it("in production routes a success response to the success branch + records request/response", async () => {
    process.env.APP_ENV = "production"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '{"status":"success"}',
      })
    )
    const { ctx } = makeCtx()
    const r = await UnsubscribeCallNode.run(ctx, NODE)
    expect(r.outcome).toBe("success")
    const lookup = r.enrichment?.context.lookups[0]
    expect(lookup).toMatchObject({
      adapter: "mailwizz",
      operation: "unsubscribe",
      status: 200,
    })
    expect(lookup?.request).toContain("jane@example.com")
    expect(lookup?.response).toContain("success")
  })

  it("in production routes a not-found response to the email_not_found branch", async () => {
    process.env.APP_ENV = "production"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '{"status":"error","error":"Subscriber not found"}',
      })
    )
    const { ctx } = makeCtx()
    const r = await UnsubscribeCallNode.run(ctx, NODE)
    expect(r.outcome).toBe("email_not_found")
  })
})

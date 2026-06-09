import { describe, it, expect, vi } from "vitest"
import type { ServerClient } from "@workspace/db/client"
import { resolveInboxRouting } from "../inbox-routing.js"

// Per-table Supabase stub: inboxes/products return configured rows, audit_log
// inserts are captured.
function makeSupabase(opts: {
  inbox: { id: string; product_id: string } | null
  defaultProduct: { id: string } | null
}) {
  const audits: Record<string, unknown>[] = []
  const make = (table: string) => {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.eq = vi.fn(() => b)
    b.insert = vi.fn((p: Record<string, unknown>) => {
      if (table === "audit_log") audits.push(p)
      return b
    })
    b.maybeSingle = vi.fn(async () => {
      if (table === "inboxes") return { data: opts.inbox, error: null }
      if (table === "products") return { data: opts.defaultProduct, error: null }
      return { data: null, error: null }
    })
    b.then = (resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null })
    return b
  }
  return { supabase: { from: vi.fn((t: string) => make(t)) }, audits }
}

describe("resolveInboxRouting", () => {
  it("maps a known Agent Mail inbox to its product + inbox", async () => {
    const { supabase, audits } = makeSupabase({
      inbox: { id: "ibx-1", product_id: "prod-1" },
      defaultProduct: { id: "prod-default" },
    })
    const routing = await resolveInboxRouting(
      supabase as unknown as ServerClient,
      "aim_inbox_1"
    )
    expect(routing).toEqual({ productId: "prod-1", inboxId: "ibx-1" })
    expect(audits).toHaveLength(0)
  })

  it("audits unknown_inbox and falls back to the default product", async () => {
    const { supabase, audits } = makeSupabase({
      inbox: null,
      defaultProduct: { id: "prod-default" },
    })
    const routing = await resolveInboxRouting(
      supabase as unknown as ServerClient,
      "aim_unknown"
    )
    expect(routing).toEqual({ productId: "prod-default", inboxId: null })
    expect(audits).toContainEqual(
      expect.objectContaining({ action: "unknown_inbox" })
    )
  })
})

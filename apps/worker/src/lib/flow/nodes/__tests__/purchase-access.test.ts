import { describe, it, expect, vi, beforeEach } from "vitest"
import type { StepContext, FlowNode } from "../../types.js"

// Per-platform fake adapters, swapped per test. getAdapter is mocked to resolve
// from this registry (and throw on unknown keys, like the real one).
type FakeAdapter = {
  key: string
  lookupOrder?: (args: { email: string }) => Promise<unknown>
  checkAccess?: (args: {
    email: string
    order: unknown
    expectedProductKey?: string | null
  }) => Promise<unknown>
}
const adapters: Record<string, FakeAdapter> = vi.hoisted(() => ({}))
vi.mock("@workspace/actions", () => ({
  getAdapter: (key: string) => {
    const a = adapters[key]
    if (!a) throw new Error(`unknown_adapter: ${key}`)
    return a
  },
}))

import { PurchaseLookupNode } from "../purchase-lookup.js"
import { AccessCheckNode } from "../access-check.js"
import { AddToDashboardNode } from "../add-to-dashboard.js"

const NODE = {
  id: "n",
  node_key: "n",
  node_type: "n",
  ai_prompt: null,
  model: null,
  config: {},
} as FlowNode

const ORDER = {
  orderId: "O-1",
  productName: "Mobile Profits",
  amount: 97,
  currency: "USD",
  purchasedAt: "2026-05-01",
}

beforeEach(() => {
  for (const k of Object.keys(adapters)) delete adapters[k]
})

describe("purchase_lookup node (orders DB)", () => {
  const ORDER_ROW = {
    order_id: "O-1",
    product_name: "Mobile Profits",
    product_id: "mp",
    amount: 97,
    currency: "USD",
    purchased_at: "2026-05-01",
  }
  // ctx whose supabase.from("orders").select().eq().eq() resolves to `result`.
  function ordersCtx(result: { data: unknown[] | null; error: unknown }) {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.then = (resolve: (v: unknown) => void) => resolve(result)
    return {
      email: { from_email: "Jane <JANE@example.com>" },
      enrichment: null,
      supabase: { from: () => q },
    } as unknown as StepContext
  }

  it("found — maps active orders into purchase-only context", async () => {
    const r = await PurchaseLookupNode.run(
      ordersCtx({ data: [ORDER_ROW], error: null }),
      NODE
    )
    expect(r.outcome).toBe("found")
    expect(r.enrichment?.context.orders).toEqual([ORDER])
    expect(r.enrichment?.customerContext).toContain("Purchase:")
    expect(r.enrichment?.customerContext).not.toContain("Account access")
    expect((r.enrichment?.context.lookups ?? []).at(-1)).toMatchObject({
      adapter: "orders_db",
      operation: "order_lookup",
      ok: true,
    })
  })

  it("not_found — clean query, no active order", async () => {
    const r = await PurchaseLookupNode.run(
      ordersCtx({ data: [], error: null }),
      NODE
    )
    expect(r.outcome).toBe("not_found")
    expect(r.enrichment?.context.orders).toEqual([])
  })

  it("failed — the orders query errored (never claims 'no purchase')", async () => {
    const r = await PurchaseLookupNode.run(
      ordersCtx({ data: null, error: { message: "db down" } }),
      NODE
    )
    expect(r.outcome).toBe("failed")
    expect((r.enrichment?.context.lookups ?? []).at(-1)).toMatchObject({
      adapter: "orders_db",
      ok: false,
    })
  })
})

describe("access_check node", () => {
  function accessCtx(checkAccess: FakeAdapter["checkAccess"]) {
    adapters.profitdashboard = { key: "profitdashboard", checkAccess }
    return {
      email: { from_email: "jane@example.com" },
      product: {
        adapterKey: "profitdashboard",
        supportConfig: { access_product_key: "mobile_profit" },
      },
      enrichment: {
        context: {
          orders: [ORDER],
          access: { hasAccess: false, details: null },
          lookups: [],
        },
        customerContext:
          "- Purchase: Mobile Profits, order O-1, 97 USD, purchased 2026-05-01.",
      },
    } as unknown as StepContext
  }

  it("has_access → appends the access line and preserves the order", async () => {
    const ctx = accessCtx(async () => ({
      hasAccess: true,
      details: "active member",
    }))
    const r = await AccessCheckNode.run(ctx, NODE)
    expect(r.outcome).toBe("has_access")
    expect(r.enrichment?.context.orders).toEqual([ORDER])
    expect(r.enrichment?.customerContext).toContain("Purchase:")
    expect(r.enrichment?.customerContext).toContain("Account access: active")
  })

  it("no_access → no_access outcome", async () => {
    const ctx = accessCtx(async () => ({ hasAccess: false, details: null }))
    const r = await AccessCheckNode.run(ctx, NODE)
    expect(r.outcome).toBe("no_access")
  })

  it("passes the found order + expected product key to checkAccess", async () => {
    const checkAccess = vi.fn(async () => ({ hasAccess: true, details: "x" }))
    const ctx = accessCtx(checkAccess)
    await AccessCheckNode.run(ctx, NODE)
    expect(checkAccess).toHaveBeenCalledWith({
      email: "jane@example.com",
      order: ORDER,
      expectedProductKey: "mobile_profit",
    })
  })

  it("failed when the access API throws (and does not claim 'no access')", async () => {
    const ctx = accessCtx(async () => {
      throw new Error("dashboard 503")
    })
    const r = await AccessCheckNode.run(ctx, NODE)
    expect(r.outcome).toBe("failed")
    expect(r.enrichment?.customerContext).not.toContain(
      "Account access: NOT found"
    )
  })

  it("failed when the product has no access adapter", async () => {
    const ctx = {
      email: { from_email: "jane@example.com" },
      product: { adapterKey: null, supportConfig: null },
      enrichment: {
        context: {
          orders: [],
          access: { hasAccess: false, details: null },
          lookups: [],
        },
        customerContext: "",
      },
    } as unknown as StepContext
    const r = await AccessCheckNode.run(ctx, NODE)
    expect(r.outcome).toBe("failed")
  })
})

describe("add_to_dashboard node (stub)", () => {
  it("escalates (failed), records the pending add_user lookup, preserves prior context", async () => {
    const ctx = {
      email: { from_email: "jane@example.com" },
      enrichment: {
        context: {
          orders: [ORDER],
          access: { hasAccess: false, details: null },
          lookups: [],
        },
        customerContext: "- Purchase: ...",
      },
    } as unknown as StepContext
    const r = await AddToDashboardNode.run(ctx, NODE)
    expect(r.outcome).toBe("failed")
    expect(r.enrichment?.context.orders).toEqual([ORDER])
    const last = (r.enrichment?.context.lookups ?? []).at(-1)
    expect(last).toMatchObject({ operation: "add_user", ok: false })
    expect(last?.summary).toMatch(/pending/)
  })
})

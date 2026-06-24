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

const stub = () => ({ found: false, orders: [], configured: false })
const empty = () => ({ found: false, orders: [] })
const withOrder = () => ({ found: true, orders: [ORDER] })

function purchaseCtx() {
  return {
    email: { from_email: "jane@example.com" },
    enrichment: null,
  } as unknown as StepContext
}

beforeEach(() => {
  for (const k of Object.keys(adapters)) delete adapters[k]
})

describe("purchase_lookup node", () => {
  it("escalates (failed) when every platform is an unconfigured stub", async () => {
    adapters.clickbank = { key: "clickbank", lookupOrder: async () => stub() }
    adapters.jvzoo = { key: "jvzoo", lookupOrder: async () => stub() }
    adapters.digistore = { key: "digistore", lookupOrder: async () => stub() }
    const r = await PurchaseLookupNode.run(purchaseCtx(), NODE)
    expect(r.outcome).toBe("failed")
    expect(r.enrichment?.context.orders).toEqual([])
    const lookups = r.enrichment?.context.lookups ?? []
    expect(lookups).toHaveLength(3)
    expect(lookups.every((l) => l.ok === false)).toBe(true)
    expect(lookups[0]?.summary).toMatch(/not configured/)
  })

  it("records lookups in a fixed platform order regardless of resolution", async () => {
    adapters.clickbank = { key: "clickbank", lookupOrder: async () => stub() }
    adapters.jvzoo = { key: "jvzoo", lookupOrder: async () => stub() }
    adapters.digistore = { key: "digistore", lookupOrder: async () => stub() }
    const r = await PurchaseLookupNode.run(purchaseCtx(), NODE)
    expect((r.enrichment?.context.lookups ?? []).map((l) => l.adapter)).toEqual(
      ["clickbank", "jvzoo", "digistore"]
    )
  })

  it("emits 'found' (purchase-only context) when a platform returns an order", async () => {
    adapters.clickbank = {
      key: "clickbank",
      lookupOrder: async () => withOrder(),
    }
    adapters.jvzoo = { key: "jvzoo", lookupOrder: async () => stub() }
    adapters.digistore = { key: "digistore", lookupOrder: async () => stub() }
    const r = await PurchaseLookupNode.run(purchaseCtx(), NODE)
    expect(r.outcome).toBe("found")
    expect(r.enrichment?.context.orders).toEqual([ORDER])
    expect(r.enrichment?.customerContext).toContain("Purchase:")
    expect(r.enrichment?.customerContext).not.toContain("Account access")
  })

  it("emits 'not_found' when platforms answer cleanly with no purchase", async () => {
    adapters.clickbank = { key: "clickbank", lookupOrder: async () => empty() }
    adapters.jvzoo = { key: "jvzoo", lookupOrder: async () => empty() }
    adapters.digistore = { key: "digistore", lookupOrder: async () => empty() }
    const r = await PurchaseLookupNode.run(purchaseCtx(), NODE)
    expect(r.outcome).toBe("not_found")
  })

  it("a single clean answer beats throwing/unconfigured peers → not_found", async () => {
    adapters.clickbank = {
      key: "clickbank",
      lookupOrder: async () => {
        throw new Error("ClickBank 500")
      },
    }
    adapters.jvzoo = { key: "jvzoo", lookupOrder: async () => empty() }
    adapters.digistore = { key: "digistore", lookupOrder: async () => stub() }
    const r = await PurchaseLookupNode.run(purchaseCtx(), NODE)
    expect(r.outcome).toBe("not_found")
  })

  it("escalates (failed) when every platform throws (e.g. all endpoints down)", async () => {
    const down = {
      lookupOrder: async () => {
        throw new Error("down")
      },
    }
    adapters.clickbank = { key: "clickbank", ...down }
    adapters.jvzoo = { key: "jvzoo", ...down }
    adapters.digistore = { key: "digistore", ...down }
    const r = await PurchaseLookupNode.run(purchaseCtx(), NODE)
    expect(r.outcome).toBe("failed")
    expect((r.enrichment?.context.lookups ?? []).every((l) => !l.ok)).toBe(true)
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

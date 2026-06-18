import { describe, it, expect, vi, beforeEach } from "vitest"

let callerRole = "admin"
const rpcSpy = vi.fn()

function makeAdmin() {
  const profile: Record<string, unknown> = {}
  profile.select = vi.fn(() => profile)
  profile.eq = vi.fn(() => profile)
  profile.single = vi.fn(async () => ({
    data: { role: callerRole },
    error: null,
  }))
  return {
    from: vi.fn(() => profile),
    rpc: (...a: unknown[]) => rpcSpy(...a),
  }
}

let adminClient: ReturnType<typeof makeAdmin>
vi.mock("@/lib/supabase/admin", () => ({
  getServerSupabase: () => adminClient,
}))
vi.mock("@/lib/supabase/server", () => ({
  getActionSupabase: async () => ({ user: { id: "u1", email: "a@x.com" } }),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { updateClassifyCategories } from "../flow-actions.js"

const valid = [
  {
    key: "refund",
    label: "Refund request",
    description: "wants money back",
    target_node_id: "n-refund",
  },
  {
    key: "other",
    label: "Other",
    description: "",
    target_node_id: "n-escalate",
  },
]

describe("updateClassifyCategories", () => {
  beforeEach(() => {
    callerRole = "admin"
    adminClient = makeAdmin()
    rpcSpy.mockReset().mockResolvedValue({ error: null })
  })

  it("rejects non-admins without calling the RPC", async () => {
    callerRole = "operator"
    const r = await updateClassifyCategories("classify-1", valid)
    expect(r.error).toBe(true)
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it("calls set_classify_categories with the trimmed payload", async () => {
    const r = await updateClassifyCategories("classify-1", valid)
    expect(r.error).toBe(false)
    expect(rpcSpy).toHaveBeenCalledWith("set_classify_categories", {
      p_node_id: "classify-1",
      p_categories: valid,
    })
  })

  it("rejects duplicate keys", async () => {
    const r = await updateClassifyCategories("classify-1", [
      { key: "x", label: "A", description: "", target_node_id: "n-1" },
      { key: "x", label: "B", description: "", target_node_id: "n-2" },
    ])
    expect(r.error).toBe(true)
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it("rejects invalid keys (uppercase / spaces)", async () => {
    const r = await updateClassifyCategories("classify-1", [
      {
        key: "Refund Request",
        label: "R",
        description: "",
        target_node_id: "n-1",
      },
    ])
    expect(r.error).toBe(true)
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it("rejects a category with no target step", async () => {
    const r = await updateClassifyCategories("classify-1", [
      { key: "refund", label: "Refund", description: "", target_node_id: "" },
    ])
    expect(r.error).toBe(true)
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it("rejects an empty category list", async () => {
    const r = await updateClassifyCategories("classify-1", [])
    expect(r.error).toBe(true)
    expect(rpcSpy).not.toHaveBeenCalled()
  })
})

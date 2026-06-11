import { describe, it, expect, vi, beforeEach } from "vitest"

let callerRole = "admin"
let targetSlug = "mobile-profits"
const insertSpy = vi.fn()
const deleteSpy = vi.fn()

function makeAdmin() {
  const make = (table: string) => {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.insert = vi.fn((p: unknown) => {
      insertSpy(p)
      return b
    })
    b.update = vi.fn(() => b)
    b.delete = vi.fn(() => {
      deleteSpy()
      return b
    })
    b.eq = vi.fn(() => b)
    b.single = vi.fn(async () => {
      if (table === "profiles") return { data: { role: callerRole }, error: null }
      if (table === "products") return { data: { slug: targetSlug }, error: null }
      return { data: null, error: null }
    })
    b.then = (resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null })
    return b
  }
  return { from: vi.fn((t: string) => make(t)) }
}

vi.mock("@/lib/supabase/server", () => ({
  getActionSupabase: async () => ({
    user: { id: "u1", email: "a@example.com" },
    supabase: {},
  }),
}))
let adminClient: ReturnType<typeof makeAdmin>
vi.mock("@/lib/supabase/admin", () => ({ getServerSupabase: () => adminClient }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { createProduct, deleteProduct } from "../product-actions.js"

function form(obj: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(obj)) f.set(k, v)
  return f
}

const valid = {
  name: "Mobile Profits",
  slug: "mobile-profits",
  platform: "clickbank",
  adapter_key: "mock",
  is_active: "active",
}

describe("product-actions", () => {
  beforeEach(() => {
    callerRole = "admin"
    targetSlug = "mobile-profits"
    insertSpy.mockReset()
    deleteSpy.mockReset()
    adminClient = makeAdmin()
  })

  it("createProduct rejects non-admins", async () => {
    callerRole = "operator"
    const r = await createProduct(form(valid))
    expect(r.error).toBe(true)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("createProduct inserts a valid product", async () => {
    const r = await createProduct(form(valid))
    expect(r.error).toBe(false)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Mobile Profits",
        slug: "mobile-profits",
        platform: "clickbank",
        adapter_key: "mock",
        is_active: true,
      })
    )
  })

  it("createProduct rejects a missing name", async () => {
    const r = await createProduct(form({ ...valid, name: "" }))
    expect(r.error).toBe(true)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("createProduct saves non-empty support_config fields and omits blanks", async () => {
    const r = await createProduct(
      form({
        ...valid,
        support_platform: "Digistore24",
        login_url: "https://acme.test/login",
        reset_url: "",
        support_notes: "use the purchase email",
      })
    )
    expect(r.error).toBe(false)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        support_config: {
          platform: "Digistore24",
          login_url: "https://acme.test/login",
          notes: "use the purchase email",
        },
      })
    )
  })

  it("createProduct rejects a non-URL support link", async () => {
    const r = await createProduct(form({ ...valid, login_url: "notaurl" }))
    expect(r.error).toBe(true)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("deleteProduct refuses to delete the default product", async () => {
    targetSlug = "default"
    const r = await deleteProduct("p-default")
    expect(r.error).toBe(true)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it("deleteProduct deletes a non-default product", async () => {
    targetSlug = "mobile-profits"
    const r = await deleteProduct("p-1")
    expect(r.error).toBe(false)
    expect(deleteSpy).toHaveBeenCalled()
  })
})

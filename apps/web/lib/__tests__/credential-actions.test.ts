import { describe, it, expect, vi, beforeEach } from "vitest"

let callerRole = "admin"
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
    b.delete = vi.fn(() => {
      deleteSpy()
      return b
    })
    b.eq = vi.fn(() => b)
    b.single = vi.fn(async () => {
      if (table === "profiles") return { data: { role: callerRole }, error: null }
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
// Stand-in encryption: returns a marker WITHOUT the plaintext, so we can assert
// the secret was encrypted (real crypto round-trip is covered in crypto.test).
vi.mock("@workspace/actions/crypto", () => ({
  encryptSecret: (s: string) => `CIPHER(${s.length})`,
}))

import { createCredential, deleteCredential } from "../credential-actions.js"

function form(obj: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(obj)) f.set(k, v)
  return f
}

const valid = {
  product_id: "prod-1",
  platform: "clickbank",
  label: "ClickBank API key",
  secret: "supersecret9999",
}

describe("credential-actions", () => {
  beforeEach(() => {
    callerRole = "admin"
    insertSpy.mockReset()
    deleteSpy.mockReset()
    adminClient = makeAdmin()
  })

  it("createCredential rejects non-admins", async () => {
    callerRole = "operator"
    const r = await createCredential(form(valid))
    expect(r.error).toBe(true)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("createCredential stores ciphertext (never the plaintext) + last4", async () => {
    const r = await createCredential(form(valid))
    expect(r.error).toBe(false)
    const payload = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload.ciphertext).toBe("CIPHER(15)")
    expect(JSON.stringify(payload)).not.toContain("supersecret9999")
    expect(payload.last4).toBe("9999")
    expect(payload.platform).toBe("clickbank")
    expect(payload.product_id).toBe("prod-1")
  })

  it("createCredential rejects a missing secret", async () => {
    const r = await createCredential(form({ ...valid, secret: "" }))
    expect(r.error).toBe(true)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("deleteCredential deletes for an admin", async () => {
    const r = await deleteCredential("cred-1")
    expect(r.error).toBe(false)
    expect(deleteSpy).toHaveBeenCalled()
  })
})

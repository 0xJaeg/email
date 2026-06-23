import { describe, it, expect, vi, beforeEach } from "vitest"

let callerRole = "admin"
const upsertSpy = vi.fn()

function makeAdmin() {
  const make = (table: string) => {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.upsert = vi.fn((rows: unknown) => {
      upsertSpy(rows)
      return b
    })
    b.eq = vi.fn(() => b)
    b.single = vi.fn(async () => {
      if (table === "profiles")
        return { data: { role: callerRole }, error: null }
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
vi.mock("@/lib/supabase/admin", () => ({
  getServerSupabase: () => adminClient,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// Stand-in encryption: returns a marker WITHOUT the plaintext, so we can assert
// the secret was encrypted (real crypto round-trip is covered in crypto.test).
vi.mock("@workspace/actions/crypto", () => ({
  encryptSecret: (s: string) => `CIPHER(${s.length})`,
}))

import { setProductKeys } from "../credential-actions.js"

function form(obj: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(obj)) f.set(k, v)
  return f
}

describe("setProductKeys", () => {
  beforeEach(() => {
    callerRole = "admin"
    upsertSpy.mockReset()
    adminClient = makeAdmin()
  })

  it("rejects non-admins", async () => {
    callerRole = "operator"
    const r = await setProductKeys(
      form({ id: "prod-1", key_clickbank_view: "supersecret9999" })
    )
    expect(r.error).toBe(true)
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it("encrypts each set key (never stores the plaintext) + keeps last4", async () => {
    const r = await setProductKeys(
      form({ id: "prod-1", key_clickbank_view: "supersecret9999" })
    )
    expect(r.error).toBe(false)
    const rows = (upsertSpy.mock.calls[0]?.[0] ?? []) as Record<
      string,
      unknown
    >[]
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.platform).toBe("clickbank")
    expect(row.scope).toBe("view")
    expect(row.ciphertext).toBe("CIPHER(15)")
    expect(row.last4).toBe("9999")
    expect(row.product_id).toBe("prod-1")
    expect(JSON.stringify(rows)).not.toContain("supersecret9999")
  })

  it("skips blank slots — no keys means no write", async () => {
    const r = await setProductKeys(form({ id: "prod-1" }))
    expect(r.error).toBe(false)
    expect(r.message).toBe("No key changes.")
    expect(upsertSpy).not.toHaveBeenCalled()
  })
})

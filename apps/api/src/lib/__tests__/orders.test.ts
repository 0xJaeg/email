import { describe, it, expect } from "vitest"
import { createHash } from "node:crypto"
import {
  verifyJvzoo,
  jvzooStatus,
  parseJvzoo,
  verifyDigistore,
  digistoreStatus,
  parseDigistore,
  recordOrder,
} from "../orders.js"

const SECRET = "TESTSECRET"

// Build a JVZoo IPN body with a correct cverify for the given ordered fields.
function signedJvzoo(fields: [string, string][]): URLSearchParams {
  let pop = ""
  for (const [, v] of fields) pop += v + "|"
  pop += SECRET
  const cverify = createHash("sha1")
    .update(pop)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase()
  const params = new URLSearchParams()
  for (const [k, v] of fields) params.append(k, v)
  params.append("cverify", cverify)
  return params
}

const JVZOO_FIELDS: [string, string][] = [
  ["ccustemail", "buyer@example.com"],
  ["ctransaction", "SALE"],
  ["ctransreceipt", "R-1"],
  ["ctransamount", "97"],
]

describe("verifyJvzoo", () => {
  it("accepts a correctly signed payload", () => {
    expect(verifyJvzoo(signedJvzoo(JVZOO_FIELDS), SECRET)).toBe(true)
  })
  it("rejects a tampered payload", () => {
    const p = signedJvzoo(JVZOO_FIELDS)
    p.set("ctransamount", "0") // changed after signing
    expect(verifyJvzoo(p, SECRET)).toBe(false)
  })
  it("rejects when cverify is missing", () => {
    expect(
      verifyJvzoo(new URLSearchParams("ccustemail=a@b.com&ctransaction=SALE"), SECRET)
    ).toBe(false)
  })
})

describe("jvzooStatus", () => {
  it("maps transaction types to status", () => {
    expect(jvzooStatus("SALE")).toBe("active")
    expect(jvzooStatus("BILL")).toBe("active")
    expect(jvzooStatus("RFND")).toBe("refunded")
    expect(jvzooStatus("CGBK")).toBe("chargeback")
    expect(jvzooStatus("CANCEL-REBILL")).toBe("cancelled")
    expect(jvzooStatus("TEST")).toBeNull()
    expect(jvzooStatus("WHATEVER")).toBeNull()
  })
})

describe("parseJvzoo", () => {
  it("maps a SALE into an order", () => {
    const p = new URLSearchParams()
    p.append("ccustemail", "Buyer@Example.com")
    p.append("ccustname", "Buyer")
    p.append("cproditem", "42")
    p.append("cprodtitle", "Mobile Profits")
    p.append("ctransaction", "SALE")
    p.append("ctransreceipt", "R-9")
    p.append("ctransamount", "97")
    expect(parseJvzoo(p)).toMatchObject({
      platform: "jvzoo",
      order_id: "R-9",
      email: "Buyer@Example.com",
      product_id: "42",
      product_name: "Mobile Profits",
      amount: 97,
      status: "active",
      event_type: "SALE",
    })
  })
  it("returns null for a non-order event (TEST)", () => {
    expect(
      parseJvzoo(
        new URLSearchParams("ctransaction=TEST&ccustemail=a@b.com&ctransreceipt=R")
      )
    ).toBeNull()
  })
  it("returns null when email or receipt is missing", () => {
    expect(
      parseJvzoo(new URLSearchParams("ctransaction=SALE&ccustemail=a@b.com"))
    ).toBeNull()
  })
})

describe("verifyDigistore", () => {
  function signedDigistore(pairs: [string, string][]): URLSearchParams {
    const params = new URLSearchParams()
    for (const [k, v] of pairs) params.append(k, v)
    const keys = [...new Set(params.keys())].sort()
    let base = ""
    for (const k of keys) {
      const v = params.get(k) ?? ""
      if (v === "") continue
      base += `${k}=${v}${SECRET}`
    }
    params.append(
      "sha_sign",
      createHash("sha512").update(base).digest("hex").toUpperCase()
    )
    return params
  }
  it("accepts a payload signed with the same scheme", () => {
    expect(
      verifyDigistore(
        signedDigistore([
          ["email", "a@b.com"],
          ["order_id", "D-1"],
        ]),
        SECRET
      )
    ).toBe(true)
  })
  it("rejects a tampered payload", () => {
    const p = signedDigistore([
      ["email", "a@b.com"],
      ["order_id", "D-1"],
    ])
    p.set("order_id", "D-2")
    expect(verifyDigistore(p, SECRET)).toBe(false)
  })
  it("accepts a payload with an empty field (empty values are skipped)", () => {
    expect(
      verifyDigistore(
        signedDigistore([
          ["email", "a@b.com"],
          ["coupon", ""],
          ["order_id", "D-1"],
        ]),
        SECRET
      )
    ).toBe(true)
  })
})

describe("digistoreStatus", () => {
  it("maps events to status", () => {
    expect(digistoreStatus("on_payment")).toBe("active")
    expect(digistoreStatus("on_rebill")).toBe("active")
    expect(digistoreStatus("refund")).toBe("refunded")
    expect(digistoreStatus("chargeback")).toBe("chargeback")
    expect(digistoreStatus("on_cancel")).toBe("cancelled")
    expect(digistoreStatus("something")).toBeNull()
  })
})

describe("parseDigistore", () => {
  it("maps a payment event into an order", () => {
    const p = new URLSearchParams()
    p.append("event", "on_payment")
    p.append("email", "b@x.com")
    p.append("buyer_first_name", "Bob")
    p.append("order_id", "D-7")
    p.append("product_id", "88")
    p.append("amount", "49")
    p.append("currency", "USD")
    expect(parseDigistore(p)).toMatchObject({
      platform: "digistore",
      order_id: "D-7",
      email: "b@x.com",
      customer_name: "Bob",
      product_id: "88",
      amount: 49,
      currency: "USD",
      status: "active",
    })
  })
  it("returns null for an unknown event", () => {
    expect(
      parseDigistore(new URLSearchParams("event=weird&email=a@b.com&order_id=1"))
    ).toBeNull()
  })
})

describe("recordOrder", () => {
  const base = {
    platform: "jvzoo",
    order_id: "R-1",
    customer_name: null,
    product_id: null,
    product_name: null,
    amount: null,
    currency: null,
    event_type: "SALE",
    purchased_at: null,
    raw: {},
  }

  it("upserts an active order (email lowercased)", async () => {
    let payload: Record<string, unknown> | null = null
    const q: Record<string, unknown> = {
      upsert: (p: Record<string, unknown>) => {
        payload = p
        return Promise.resolve({ error: null })
      },
    }
    const supabase = { from: () => q } as never
    await recordOrder(supabase, {
      ...base,
      email: "A@B.com",
      status: "active",
    })
    expect(payload).not.toBeNull()
    expect(payload!.email).toBe("a@b.com")
  })

  it("flips status via update for a refund on an existing order", async () => {
    let updated: Record<string, unknown> | null = null
    const q: Record<string, unknown> = {
      update: (p: Record<string, unknown>) => {
        updated = p
        return q
      },
      eq: () => q,
      select: () => Promise.resolve({ data: [{ id: "x" }], error: null }),
    }
    const supabase = { from: () => q } as never
    await recordOrder(supabase, {
      ...base,
      email: "a@b.com",
      event_type: "RFND",
      status: "refunded",
    })
    expect(updated!.status).toBe("refunded")
  })
})

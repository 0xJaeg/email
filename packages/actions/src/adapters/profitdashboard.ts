import type { ProductAdapter } from "../types.js"

// Madhav's Profit Dashboard membership API: given an email, it confirms whether
// the person is a member and which product they have access to. It is an
// ACCESS check, not an order/refund API — so lookupOrder has no data and
// refunds run through the payment platform, not here.
const ENDPOINT = "https://profitdashboard.io/api/email-lookup"
const TIMEOUT_MS = 10_000

type LookupResponse = {
  status?: boolean
  data?: {
    exists?: boolean
    role?: string | null
    product?: { key?: string; displayName?: string } | null
    loginCount?: number | null
    lastLoginAt?: string | null
    createdAt?: string | null
  } | null
}

// Inbound from_email may be "Display Name <addr@x.com>"; the API wants the bare
// address. Extract it (and lowercase — the API matches case-insensitively).
function bareEmail(input: string): string {
  const match = input.match(/<([^>]+)>/)
  return (match ? match[1]! : input).trim().toLowerCase()
}

export const ProfitDashboardAdapter: ProductAdapter = {
  key: "profitdashboard",

  // No order/purchase data from this API.
  async lookupOrder() {
    return { found: false, orders: [] }
  },

  async checkAccess({ email, expectedProductKey }) {
    const apiKey = process.env.PROFITDASHBOARD_API_KEY
    if (!apiKey) throw new Error("Missing PROFITDASHBOARD_API_KEY in env")

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ email: bareEmail(email) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new Error(
        `profitdashboard access check: POST ${ENDPOINT} → HTTP ${res.status}`
      )
    }
    const http = { endpoint: ENDPOINT, method: "POST", status: res.status }

    const body = (await res.json()) as LookupResponse
    const d = body.data
    if (!body.status || !d?.exists) {
      return { hasAccess: false, details: null, http }
    }
    // The API spans multiple products. If this product expects a specific key,
    // a member of a DIFFERENT product is not a member of THIS one — don't grant
    // access (e.g. a Morning Method member emailing the Profit Dashboard inbox).
    if (
      expectedProductKey &&
      d.product?.key &&
      d.product.key !== expectedProductKey
    ) {
      return { hasAccess: false, details: null, http }
    }

    // PII-light: only what a support reply needs. Deliberately omit the
    // address/phone/name fields the API also returns.
    const parts = [
      `Verified member of ${d.product?.displayName ?? "the product"}.`,
    ]
    if (d.role) parts.push(`Role: ${d.role}.`)
    if (typeof d.loginCount === "number") parts.push(`${d.loginCount} logins.`)
    if (d.lastLoginAt) parts.push(`Last login ${d.lastLoginAt}.`)
    return { hasAccess: true, details: parts.join(" "), http }
  },

  // A membership API can't move money — refunds go through the payment platform.
  async issueRefund() {
    return {
      ok: false,
      error: "profitdashboard is an access-check API and cannot issue refunds",
    }
  },
}

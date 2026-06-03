import type { ProductAdapter } from "../types.js"

// Pending real ClickBank API credentials + endpoints. Until those land:
// enrichment returns empty (the agent drafts a safe reply for human review
// rather than fabricating order/access), and refunds fail loudly so the
// approval rewinds. Swap these bodies for real ClickBank calls.
export const ClickbankAdapter: ProductAdapter = {
  key: "clickbank",
  async lookupOrder() {
    return { found: false, orders: [] }
  },
  async checkAccess() {
    return { hasAccess: false, details: null }
  },
  async issueRefund() {
    return {
      ok: false,
      error: "clickbank adapter not configured (pending API credentials)",
    }
  },
}

import type { ProductAdapter } from "../types.js"

// Pending real Digistore24 API credentials + endpoints. Until those land:
// enrichment returns empty (the agent drafts a safe reply for human review
// rather than fabricating order/access), and refunds fail loudly so the
// approval rewinds. Swap these bodies for real Digistore calls.
export const DigistoreAdapter: ProductAdapter = {
  key: "digistore",
  async lookupOrder() {
    return { found: false, orders: [], configured: false }
  },
  async checkAccess() {
    return { hasAccess: false, details: null }
  },
  async issueRefund() {
    return {
      ok: false,
      error: "digistore adapter not configured (pending API credentials)",
    }
  },
}

import type { ProductAdapter } from "../types.js"

// Pending real JVZoo API credentials + endpoints. Same contract as ClickBank.
export const JvzooAdapter: ProductAdapter = {
  key: "jvzoo",
  async lookupOrder() {
    return { found: false, orders: [] }
  },
  async checkAccess() {
    return { hasAccess: false, details: null }
  },
  async issueRefund() {
    return {
      ok: false,
      error: "jvzoo adapter not configured (pending API credentials)",
    }
  },
}

import type { LookupRecord } from "../../customer-context.js"
import type { NodeType } from "../types.js"

// Add-to-dashboard: grant a confirmed buyer access via the dashboard add-user
// API, then send their login details. Reached only when purchase_lookup found a
// purchase AND access_check returned no_access.
//
// STUB — Madhav's add-user API isn't available yet, so this records the gap and
// escalates (failed). The structural `success → reply_login` edge already exists
// for when the API lands. When wired, this becomes a SCOPED mutation — a 2nd
// exception to the draft-only invariant, alongside unsubscribe_call — and MUST be
// gated on `APP_ENV === "production"` so it never fires in dev.
export const AddToDashboardNode: NodeType = {
  type: "add_to_dashboard",
  async run(ctx) {
    const prev = ctx.enrichment?.context
    const lookup: LookupRecord = {
      adapter: "dashboard",
      operation: "add_user",
      ok: false,
      summary: "add-user API not configured (pending Madhav API) — escalating",
    }
    return {
      outcome: "failed",
      enrichment: {
        context: {
          orders: prev?.orders ?? [],
          access: prev?.access ?? { hasAccess: false, details: null },
          lookups: [...(prev?.lookups ?? []), lookup],
        },
        customerContext: ctx.enrichment?.customerContext ?? "",
      },
    }
  },
}

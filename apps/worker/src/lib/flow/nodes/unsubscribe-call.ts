import { unsubscribeFromAllLists } from "@workspace/actions/mailwizz"
import { normalizeEmailAddress } from "../../email-address.js"
import type { LookupRecord } from "../../customer-context.js"
import type { NodeType } from "../types.js"

// Unsubscribe flow: call MailWizz to remove the customer from all lists, branch
// on the response (success / email_not_found / failed), and capture the request +
// response for the trace.
//
// SCOPED EXCEPTION to the draft-only invariant: this is the one worker node that
// performs an outbound mutation — but only in production (`APP_ENV=production`;
// dev skips the call). It's safe to auto-run: the customer asked to be removed,
// it's idempotent and reversible, and no money or message goes out. Sends +
// refunds stay approval-gated; the confirmation reply here is still drafted
// downstream and approved by a human. The internal suppression_list is always
// written so we never email someone who asked to stop (and so dev stays testable).
export const UnsubscribeCallNode: NodeType = {
  type: "unsubscribe_call",
  async run(ctx) {
    const email = normalizeEmailAddress(ctx.email.from_email)
    const isProd = process.env.APP_ENV === "production"

    let outcome: string
    let lookup: LookupRecord
    if (!isProd) {
      outcome = "skipped"
      lookup = {
        adapter: "mailwizz",
        operation: "unsubscribe",
        ok: true,
        summary: "skipped (development)",
      }
    } else {
      const r = await unsubscribeFromAllLists(email)
      outcome = r.outcome
      lookup = {
        adapter: "mailwizz",
        operation: "unsubscribe",
        ok: r.outcome !== "failed",
        summary: r.detail,
        endpoint: r.endpoint,
        method: r.method,
        status: r.status,
        request: r.request,
        response: r.response,
      }
    }

    // Internal opt-out — always honor the request (our source of truth),
    // regardless of the MailWizz outcome. No decision row exists yet, so no
    // source_decision_id; the trace links the call via the thread.
    await ctx.supabase
      .from("suppression_list")
      .upsert({ email, reason: "unsubscribe" }, { onConflict: "email" })

    // Stash the call into enrichment.context.lookups so DraftStep persists it to
    // decisions.context.lookups and the trace can render request/response.
    const prev = ctx.enrichment?.context
    return {
      outcome,
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

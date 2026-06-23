import type { SuppressContactArgs, SuppressContactResult } from "./types.js"
import { unsubscribeFromAllLists } from "./mailwizz.js"

// Adds a contact to the global suppression list (outbound-email opt-out) and, in
// production, unsubscribes them from MailWizz (the real marketing-system removal).
// The DB record is the source of truth; the MailWizz call is best-effort and
// gated to APP_ENV=production so it never fires in development. Every attempt is
// audited with the real endpoint + HTTP status.
export async function suppressContact(
  args: SuppressContactArgs
): Promise<SuppressContactResult> {
  const email = args.email.trim().toLowerCase()

  const { error: dbErr } = await args.supabase
    .from("suppression_list")
    .upsert(
      { email, reason: args.reason, source_decision_id: args.decisionId },
      { onConflict: "email" }
    )

  // External removal in MailWizz — only in production. Development still records
  // the internal opt-out above (so the flow is testable) but skips the real call.
  let mailwizz:
    | string
    | { endpoint: string; method: "PUT"; status: number | null; outcome: string }
  if (dbErr) {
    mailwizz = "skipped_after_db_error"
  } else if (process.env.APP_ENV !== "production") {
    mailwizz = "skipped (development)"
  } else {
    const r = await unsubscribeFromAllLists(email)
    mailwizz = {
      endpoint: r.endpoint,
      method: r.method,
      status: r.status,
      outcome: r.detail,
    }
  }

  const ok = !dbErr
  await args.supabase.from("audit_log").insert({
    action: "suppress_contact",
    email_id: args.emailId,
    status: ok ? "success" : "failure",
    error: ok ? null : dbErr.message,
    payload: {
      decision_id: args.decisionId,
      email,
      reason: args.reason,
      mailwizz,
    },
  })
  return ok ? { ok: true } : { ok: false, error: dbErr.message }
}

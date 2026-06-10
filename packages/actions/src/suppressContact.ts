import type {
  SuppressContactArgs,
  SuppressContactResult,
} from "./types.js"

// Adds a contact to the global suppression list (outbound-email opt-out) and,
// if SUPPRESSION_WEBHOOK_URL is configured, notifies the external email/
// marketing system. The DB record is the source of truth; the webhook is
// best-effort. Every attempt is audited.
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

  let webhook: string
  const url = process.env.SUPPRESSION_WEBHOOK_URL
  if (!url) {
    webhook = "no_webhook_configured"
  } else if (dbErr) {
    webhook = "skipped_after_db_error"
  } else {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, reason: args.reason }),
      })
      webhook = `posted_${res.status}`
    } catch (err) {
      webhook = `webhook_failed: ${err instanceof Error ? err.message : String(err)}`
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
      webhook,
    },
  })
  return ok ? { ok: true } : { ok: false, error: dbErr.message }
}

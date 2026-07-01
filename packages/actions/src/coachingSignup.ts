import type { CoachingSignupArgs, CoachingSignupResult } from "./types.js"
import { subscribeToList } from "./mailwizz.js"

// Save-the-sale action: subscribe the customer to the coaching email series
// (offered instead of a refund). Gated to APP_ENV=production, so development
// records the intent (audit) but skips the real MailWizz call. Best-effort by
// design — a failed or not-yet-configured signup must NOT block the retention
// reply (the approval path sends it regardless). Every attempt is audited with
// the real endpoint + HTTP status.
export async function coachingSignup(
  args: CoachingSignupArgs
): Promise<CoachingSignupResult> {
  const email = args.email.trim().toLowerCase()

  let mailwizz:
    | string
    | {
        endpoint: string
        method: "POST"
        status: number | null
        detail: string
      }
  if (process.env.APP_ENV !== "production") {
    mailwizz = "skipped (development)"
  } else {
    const r = await subscribeToList(email, args.list)
    mailwizz = {
      endpoint: r.endpoint,
      method: r.method,
      status: r.status,
      detail: r.detail,
    }
  }

  const detail = typeof mailwizz === "string" ? mailwizz : mailwizz.detail
  const ok = detail === "subscribed" || detail === "skipped (development)"

  await args.supabase.from("audit_log").insert({
    action: "coaching_signup",
    email_id: args.emailId,
    status: ok ? "success" : "failure",
    error: ok ? null : detail,
    payload: {
      decision_id: args.decisionId,
      email,
      list: args.list ?? null,
      mailwizz,
    },
  })

  return { ok, detail }
}

// MailWizz unsubscribe API. Given an email, unsubscribes it from ALL lists
// silently (no email sent) — the real marketing-system opt-out. Auth is a single
// X-Api-Key header (no signing). This is best-effort and never throws: the
// internal suppression_list is the source of truth, and the caller audits the
// endpoint + HTTP status this returns (visible, like the order-lookup calls).
const ENDPOINT_PATH = "/lists/subscribers/unsubscribe-by-email-from-all-lists"
const TIMEOUT_MS = 10_000

export type MailwizzResult = {
  ok: boolean
  status: number | null
  endpoint: string
  method: "PUT"
  /** "unsubscribed" on success; "http_<status>", "not_configured", or an error message otherwise. */
  detail: string
}

export async function unsubscribeFromAllLists(
  email: string
): Promise<MailwizzResult> {
  const base = (process.env.MAILWIZZ_API_URL ?? "").replace(/\/+$/, "")
  const apiKey = process.env.MAILWIZZ_API_KEY
  const endpoint = `${base}${ENDPOINT_PATH}`
  const method = "PUT" as const

  if (!base || !apiKey) {
    return {
      ok: false,
      status: null,
      endpoint,
      method,
      detail: "not_configured",
    }
  }

  try {
    const res = await fetch(endpoint, {
      method,
      headers: {
        "X-Api-Key": apiKey,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ EMAIL: email }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return {
      ok: res.ok,
      status: res.status,
      endpoint,
      method,
      detail: res.ok ? "unsubscribed" : `http_${res.status}`,
    }
  } catch (err) {
    return {
      ok: false,
      status: null,
      endpoint,
      method,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

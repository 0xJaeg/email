// MailWizz unsubscribe API. Given an email, unsubscribes it from ALL lists
// silently (no email sent) — the real marketing-system opt-out. Auth is a single
// X-Api-Key header (no signing). Best-effort + never throws: the caller branches
// on `outcome` and shows `request`/`response` in the trace.
const ENDPOINT_PATH = "/lists/subscribers/unsubscribe-by-email-from-all-lists"
const TIMEOUT_MS = 10_000

export type MailwizzOutcome = "success" | "email_not_found" | "failed"

export type MailwizzResult = {
  ok: boolean
  status: number | null
  endpoint: string
  method: "PUT"
  /** The branch the unsubscribe flow routes on. */
  outcome: MailwizzOutcome
  /** PII-light: the email param we sent (shown in the trace). */
  request: string
  /** PII-light: the response envelope/error, truncated (shown in the trace). */
  response: string
  /** "unsubscribed" / "http_<status>" / "not_configured" / an error message. */
  detail: string
}

// MailWizz wraps responses as { status: "success" | "error", error?, data? }. The
// not-found shape is undocumented, so this is best-effort: an error mentioning
// subscriber / not-found / exist maps to email_not_found, otherwise failed. Tune
// once the trace surfaces real responses.
function classifyBody(bodyText: string): {
  outcome: MailwizzOutcome
  detail: string
} {
  let parsed: { status?: unknown; error?: unknown } = {}
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    return { outcome: "failed", detail: "unparseable response" }
  }
  if (parsed.status === "success")
    return { outcome: "success", detail: "unsubscribed" }
  const err =
    typeof parsed.error === "string"
      ? parsed.error
      : JSON.stringify(parsed.error ?? "")
  if (/not\s*found|no\s*subscriber|subscriber|exist/i.test(err))
    return { outcome: "email_not_found", detail: err || "subscriber not found" }
  return { outcome: "failed", detail: err || "error" }
}

export type MailwizzSubscribeResult = {
  ok: boolean
  status: number | null
  endpoint: string
  method: "POST"
  /** PII-light: the email param we sent (shown in the trace). */
  request: string
  /** PII-light: the response envelope/error, truncated (shown in the trace). */
  response: string
  /** "subscribed" / "http_<status>" / "not_configured" / an error message. */
  detail: string
}

// MailWizz add-subscriber: POST the email to a specific list. The coaching list
// uid comes from the arg or MAILWIZZ_COACHING_LIST_UID; without base URL, api
// key, AND a list uid this is not_configured (the coaching integration is a
// pending external dependency — never invent a list). Best-effort, never throws.
export async function subscribeToList(
  email: string,
  listUid?: string
): Promise<MailwizzSubscribeResult> {
  const base = (process.env.MAILWIZZ_API_URL ?? "").replace(/\/+$/, "")
  const apiKey = process.env.MAILWIZZ_API_KEY
  const list = listUid || process.env.MAILWIZZ_COACHING_LIST_UID || ""
  const method = "POST" as const
  const request = `EMAIL=${email}`
  const endpoint = `${base}/lists/${list || "<list>"}/subscribers`

  if (!base || !apiKey || !list) {
    return {
      ok: false,
      status: null,
      endpoint,
      method,
      request,
      response: "",
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
    const response = (await res.text().catch(() => "")).slice(0, 300)
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        endpoint,
        method,
        request,
        response,
        detail: `http_${res.status}`,
      }
    }
    return {
      ok: true,
      status: res.status,
      endpoint,
      method,
      request,
      response,
      detail: "subscribed",
    }
  } catch (err) {
    return {
      ok: false,
      status: null,
      endpoint,
      method,
      request,
      response: "",
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function unsubscribeFromAllLists(
  email: string
): Promise<MailwizzResult> {
  const base = (process.env.MAILWIZZ_API_URL ?? "").replace(/\/+$/, "")
  const apiKey = process.env.MAILWIZZ_API_KEY
  const endpoint = `${base}${ENDPOINT_PATH}`
  const method = "PUT" as const
  const request = `EMAIL=${email}`

  if (!base || !apiKey) {
    return {
      ok: false,
      status: null,
      endpoint,
      method,
      outcome: "failed",
      request,
      response: "",
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
    const response = (await res.text().catch(() => "")).slice(0, 300)
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        endpoint,
        method,
        outcome: "failed",
        request,
        response,
        detail: `http_${res.status}`,
      }
    }
    const c = classifyBody(response)
    return {
      ok: c.outcome === "success",
      status: res.status,
      endpoint,
      method,
      outcome: c.outcome,
      request,
      response,
      detail: c.detail,
    }
  } catch (err) {
    return {
      ok: false,
      status: null,
      endpoint,
      method,
      outcome: "failed",
      request,
      response: "",
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

// No "server-only" import: these helpers take a ServerClient param and import
// no secrets, so reports.ts (and its unit test) can import them safely.
import type { ServerClient } from "@workspace/db/client"

export type AppSettings = {
  refundDailyLimit: number | null // null = no cap
  refundAlertRecipients: string[]
}

// The single app_settings row. Falls back to safe defaults (no cap, no
// recipients) if the row is somehow missing.
export async function getAppSettings(
  client: ServerClient
): Promise<AppSettings> {
  const { data } = await client
    .from("app_settings")
    .select("refund_daily_limit, refund_alert_recipients")
    .eq("id", true)
    .maybeSingle()
  return {
    refundDailyLimit: data?.refund_daily_limit ?? null,
    refundAlertRecipients: data?.refund_alert_recipients ?? [],
  }
}

// Parse the alert-recipients textarea: split on commas/newlines, trim, drop
// blanks. Pure (no validation here — the action validates the addresses).
export function parseRecipients(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// Refunds actually EXECUTED today (UTC), from the audit log. Real refunds audit
// as `refund_customer` (success); mock/test-mode as `refund_customer_stub` —
// only real, money-moving refunds count toward the daily cap + the counter.
export async function countRefundsToday(client: ServerClient): Promise<number> {
  const now = new Date()
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString()
  const { count } = await client
    .from("audit_log")
    .select("*", { count: "exact", head: true })
    .eq("action", "refund_customer")
    .eq("status", "success")
    .gte("created_at", since)
  return count ?? 0
}

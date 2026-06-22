import type { ServerClient } from "@workspace/db/client"
import { getAppSettings, countRefundsToday } from "@/lib/settings"

type DbClient = ServerClient

// Approximate Anthropic list prices (USD per 1M tokens). These are estimates
// for the dashboard — verify against current pricing. Cached reads bill at a
// fraction of fresh input.
const PRICES: Record<
  string,
  { input: number; output: number; cacheRead: number }
> = {
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3 },
}
const DEFAULT_PRICE = PRICES["claude-haiku-4-5"]!

export type TokenUsage = {
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
}

// Pure: token usage → estimated USD. Tested in reports.test.ts.
export function estimateCostUsd(usages: TokenUsage[]): number {
  let total = 0
  for (const u of usages) {
    const p = PRICES[u.model] ?? DEFAULT_PRICE
    total += (u.inputTokens / 1_000_000) * p.input
    total += (u.outputTokens / 1_000_000) * p.output
    total += (u.cacheReadTokens / 1_000_000) * p.cacheRead
  }
  return total
}

export type VolumePoint = { date: string; label: string; count: number }

export type ReportStats = {
  totalEmails: number
  pendingApproval: number
  needsHuman: number
  sent: number
  autoHandledRate: number // % of decisions that didn't need a person (not escalate/needs_human)
  byDecision: Record<string, number>
  byClassification: { refund_request: number; faq: number; other: number }
  volumeByDay: VolumePoint[]
  estCostUsd: number
  costWindowDays: number
  refundsToday: number
  refundDailyLimit: number | null // null = no cap
  refundLimitReached: boolean
}

const COST_WINDOW_DAYS = 30
const VOLUME_DAYS = 14
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

// Pure: inbound timestamps → an ordered last-N-days series (zero-filled), in
// UTC so the buckets are deterministic. Tested in reports.test.ts.
export function bucketVolumeByDay(
  received: string[],
  now: Date,
  days = VOLUME_DAYS
): VolumePoint[] {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1))
  )
  const points: VolumePoint[] = []
  const index = new Map<string, number>()
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    const key = d.toISOString().slice(0, 10)
    points.push({ date: key, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`, count: 0 })
    index.set(key, i)
  }
  for (const ts of received) {
    if (!ts) continue
    const i = index.get(ts.slice(0, 10))
    if (i !== undefined) points[i]!.count++
  }
  return points
}

type RawUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number | null
}
function toUsage(model: string, u: RawUsage | null | undefined): TokenUsage | null {
  if (!u) return null
  return {
    model,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
  }
}

export async function fetchReportStats(client: DbClient): Promise<ReportStats> {
  const head = { count: "exact" as const, head: true }
  const decByStatus = (status: string) =>
    client.from("decisions").select("*", head).eq("status", status)
  const decByDecision = (decision: string) =>
    client.from("decisions").select("*", head).eq("decision", decision)
  const decByClass = (c: string) =>
    client.from("decisions").select("*", head).eq("classification", c)

  const since = new Date(
    Date.now() - COST_WINDOW_DAYS * 86_400_000
  ).toISOString()
  const volSince = new Date(
    Date.now() - VOLUME_DAYS * 86_400_000
  ).toISOString()

  const [
    totalEmails,
    totalDecisions,
    pendingApproval,
    needsHuman,
    sent,
    escalate,
    faqReply,
    offer1,
    offer2,
    refund,
    refundCb,
    clsRefund,
    clsFaq,
    clsOther,
    usageRows,
    volRows,
    appSettings,
    refundsToday,
  ] = await Promise.all([
    client.from("emails").select("*", head).eq("direction", "inbound"),
    client.from("decisions").select("*", head),
    decByStatus("pending_approval"),
    decByStatus("needs_human"),
    decByStatus("sent"),
    decByDecision("escalate"),
    decByDecision("send_faq_reply"),
    decByDecision("send_offer_1"),
    decByDecision("send_offer_2"),
    decByDecision("issue_refund"),
    decByDecision("issue_refund_chargeback"),
    decByClass("refund_request"),
    decByClass("faq"),
    decByClass("other"),
    client
      .from("audit_log")
      .select("action, payload")
      .in("action", [
        "classify_email",
        "reply_pending_approval",
        "refund_pending_approval",
      ])
      .gte("created_at", since)
      .limit(5000),
    client
      .from("emails")
      .select("received_at")
      .eq("direction", "inbound")
      .gte("received_at", volSince)
      .limit(10000),
    getAppSettings(client),
    countRefundsToday(client),
  ])

  const decisions = totalDecisions.count ?? 0
  const escalations = (escalate.count ?? 0) + (needsHuman.count ?? 0)

  // Estimate AI spend from the token usage recorded in the audit log.
  const usages: TokenUsage[] = []
  for (const row of usageRows.data ?? []) {
    const payload = row.payload as { usage?: Record<string, unknown> } | null
    const usage = payload?.usage
    if (!usage) continue
    if (row.action === "classify_email") {
      const h = toUsage("claude-haiku-4-5", usage.haiku as RawUsage)
      const s = toUsage("claude-sonnet-4-6", usage.sonnet as RawUsage)
      if (h) usages.push(h)
      if (s) usages.push(s)
    } else {
      const h = toUsage("claude-haiku-4-5", usage as RawUsage)
      if (h) usages.push(h)
    }
  }

  return {
    totalEmails: totalEmails.count ?? 0,
    pendingApproval: pendingApproval.count ?? 0,
    needsHuman: needsHuman.count ?? 0,
    sent: sent.count ?? 0,
    autoHandledRate:
      decisions > 0
        ? Math.round(((decisions - escalations) / decisions) * 100)
        : 0,
    byDecision: {
      send_faq_reply: faqReply.count ?? 0,
      send_offer_1: offer1.count ?? 0,
      send_offer_2: offer2.count ?? 0,
      issue_refund: refund.count ?? 0,
      issue_refund_chargeback: refundCb.count ?? 0,
      escalate: escalate.count ?? 0,
    },
    byClassification: {
      refund_request: clsRefund.count ?? 0,
      faq: clsFaq.count ?? 0,
      other: clsOther.count ?? 0,
    },
    volumeByDay: bucketVolumeByDay(
      (volRows.data ?? []).map((r) => r.received_at as string),
      new Date()
    ),
    estCostUsd: estimateCostUsd(usages),
    costWindowDays: COST_WINDOW_DAYS,
    refundsToday,
    refundDailyLimit: appSettings.refundDailyLimit,
    refundLimitReached:
      appSettings.refundDailyLimit != null &&
      refundsToday >= appSettings.refundDailyLimit,
  }
}

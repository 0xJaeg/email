import type { ServerClient } from "@workspace/db/client"

// ServerClient and BrowserClient are both SupabaseClient<Database> — this type
// accepts either. Imported as a type only (no secret-key runtime code).
type DbClient = ServerClient

export type TicketRow = {
  id: string
  sender: string
  subject: string
  receivedAt: string
  threadStatus: string
  classification: string | null
  decision: string | null
}

export type DashboardStats = {
  emailsToday: number
  totalThreads: number
  refundShare: number // % of decisions classified refund_request
  decidedShare: number // % of inbound emails that have a decision
}

export type ActivityRow = {
  id: string
  action: string
  status: string
  emailId: string | null
  error: string | null
  createdAt: string
}

export async function fetchTickets(client: DbClient): Promise<TicketRow[]> {
  const { data, error } = await client
    .from("emails")
    .select(
      "id, from_email, subject, received_at, threads(status), decisions(classification, decision, created_at)"
    )
    .eq("direction", "inbound")
    .order("received_at", { ascending: false })
    .limit(100)
  if (error) throw new Error(`fetchTickets failed: ${error.message}`)

  return (data ?? []).map((e) => {
    const latest = [...(e.decisions ?? [])].sort((a, b) =>
      (b.created_at ?? "").localeCompare(a.created_at ?? "")
    )[0]
    return {
      id: e.id,
      sender: e.from_email,
      subject: e.subject,
      receivedAt: e.received_at,
      threadStatus: e.threads?.status ?? "open",
      classification: latest?.classification ?? null,
      decision: latest?.decision ?? null,
    }
  })
}

export async function fetchStats(client: DbClient): Promise<DashboardStats> {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const head = { count: "exact" as const, head: true }
  const [emailsToday, totalThreads, totalDecisions, refundDecisions, inbound] =
    await Promise.all([
      client
        .from("emails")
        .select("*", head)
        .gte("received_at", startOfToday.toISOString()),
      client.from("threads").select("*", head),
      client.from("decisions").select("*", head),
      client
        .from("decisions")
        .select("*", head)
        .eq("classification", "refund_request"),
      client.from("emails").select("*", head).eq("direction", "inbound"),
    ])

  const decisions = totalDecisions.count ?? 0
  const refunds = refundDecisions.count ?? 0
  const inboundCount = inbound.count ?? 0

  return {
    emailsToday: emailsToday.count ?? 0,
    totalThreads: totalThreads.count ?? 0,
    refundShare: decisions > 0 ? Math.round((refunds / decisions) * 100) : 0,
    decidedShare:
      inboundCount > 0 ? Math.round((decisions / inboundCount) * 100) : 0,
  }
}

export async function fetchActivity(client: DbClient): Promise<ActivityRow[]> {
  const { data, error } = await client
    .from("audit_log")
    .select("id, action, status, email_id, error, created_at")
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) throw new Error(`fetchActivity failed: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    status: r.status,
    emailId: r.email_id,
    error: r.error,
    createdAt: r.created_at,
  }))
}

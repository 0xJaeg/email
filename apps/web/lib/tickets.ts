import type { ServerClient } from "@workspace/db/client"
import { sanitizeSearch } from "@/lib/search"

// ServerClient and BrowserClient are both SupabaseClient<Database> — this type
// accepts either. Imported as a type only (no secret-key runtime code).
type DbClient = ServerClient

export type TicketRow = {
  id: string
  threadId: string
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
  error: string | null
  sender: string | null
  subject: string | null
  threadId: string | null
  /** The reply the agent sent, on send_reply rows (from the audit payload). */
  replyText: string | null
  createdAt: string
}

export async function fetchTickets(client: DbClient): Promise<TicketRow[]> {
  const { data, error } = await client
    .from("emails")
    .select(
      "id, thread_id, from_email, subject, received_at, threads(status), decisions(classification, decision, created_at)"
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
      threadId: e.thread_id,
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

export async function fetchActivity(
  client: DbClient,
  query: string,
  page: number,
  size: number
): Promise<{ data: ActivityRow[]; count: number }> {
  let q = client
    .from("audit_log")
    .select(
      "id, action, status, error, created_at, payload, emails(thread_id, from_email, subject)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })

  const esc = sanitizeSearch(query)
  if (esc) {
    q = q.or(`action.ilike.%${esc}%,error.ilike.%${esc}%`)
  }

  const { data, error, count } = await q.range(
    (page - 1) * size,
    page * size - 1
  )
  if (error) throw new Error(`fetchActivity failed: ${error.message}`)
  return {
    data: (data ?? []).map((r) => {
      // email_id has on-delete-set-null and is absent for system events;
      // the to-one embed comes back as object-or-array depending on PostgREST.
      const email = Array.isArray(r.emails) ? r.emails[0] : r.emails
      const payload = (r.payload ?? {}) as Record<string, unknown>
      const replyText =
        typeof payload.reply_text === "string" ? payload.reply_text : null
      return {
        id: r.id,
        action: r.action,
        status: r.status,
        error: r.error,
        sender: email?.from_email ?? null,
        subject: email?.subject ?? null,
        threadId: email?.thread_id ?? null,
        replyText,
        createdAt: r.created_at,
      }
    }),
    count: count ?? 0,
  }
}

export type ThreadTicketRow = {
  id: string
  sender: string
  subject: string
  status: string
  classification: string | null
  decision: string | null
  createdAt: string
}

// Per-thread ticket list (one row = one conversation), searchable + paginated.
// Takes a client param so this module stays client-safe (the dashboard's
// realtime tickets-table imports fetchTickets from here).
export async function getTickets(
  client: DbClient,
  query: string,
  page: number,
  size: number
): Promise<{ data: ThreadTicketRow[]; count: number }> {
  let q = client
    .from("threads")
    .select(
      "id, sender_email, subject, status, created_at, emails(decisions(classification, decision, created_at))",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })

  const esc = sanitizeSearch(query)
  if (esc) {
    q = q.or(`sender_email.ilike.%${esc}%,subject.ilike.%${esc}%`)
  }

  const { data, error, count } = await q.range(
    (page - 1) * size,
    page * size - 1
  )
  if (error) throw new Error(`getTickets failed: ${error.message}`)

  return {
    data: (data ?? []).map((t) => {
      // Latest decision across the thread's emails — same reduce as fetchTickets.
      const decisions = (t.emails ?? []).flatMap((e) => e.decisions ?? [])
      const latest = [...decisions].sort((a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? "")
      )[0]
      return {
        id: t.id,
        sender: t.sender_email,
        subject: t.subject,
        status: t.status,
        classification: latest?.classification ?? null,
        decision: latest?.decision ?? null,
        createdAt: t.created_at,
      }
    }),
    count: count ?? 0,
  }
}

export type ThreadDecision = {
  id: string
  classification: string | null
  decision: string | null
  refundRequestCount: number | null
  templateUsed: string | null
  llmModel: string | null
  llmReasoning: string | null
  status: string
  draftReplyText: string | null
  approvedAt: string | null
  approvedBy: string | null
  createdAt: string
}

export type ThreadAudit = {
  id: string
  action: string
  status: string
  error: string | null
  createdAt: string
}

export type ThreadEmail = {
  id: string
  direction: string
  from: string
  to: string
  subject: string
  bodyText: string | null
  receivedAt: string
  decisions: ThreadDecision[]
  audit: ThreadAudit[]
}

export type ThreadDetail = {
  id: string
  sender: string
  subject: string
  status: string
  createdAt: string
  emails: ThreadEmail[]
}

const byCreatedAt = (a: { created_at: string }, b: { created_at: string }) =>
  (a.created_at ?? "").localeCompare(b.created_at ?? "")

// Full thread drill-down: the conversation's emails, each with its decisions
// and audit entries. One nested query (threads → emails → {decisions, audit_log}).
export async function getThreadDetail(
  client: DbClient,
  threadId: string
): Promise<ThreadDetail | null> {
  const { data, error } = await client
    .from("threads")
    .select(
      "id, sender_email, subject, status, created_at, emails(id, direction, from_email, to_email, subject, body_text, received_at, decisions(id, classification, decision, refund_request_count, template_used, llm_model, llm_reasoning, status, draft_reply_text, approved_at, approved_by, created_at), audit_log(id, action, status, error, created_at))"
    )
    .eq("id", threadId)
    .maybeSingle()
  if (error) throw new Error(`getThreadDetail failed: ${error.message}`)
  if (!data) return null

  const emails = [...(data.emails ?? [])]
    .sort((a, b) => (a.received_at ?? "").localeCompare(b.received_at ?? ""))
    .map((e) => ({
      id: e.id,
      direction: e.direction,
      from: e.from_email,
      to: e.to_email,
      subject: e.subject,
      bodyText: e.body_text,
      receivedAt: e.received_at,
      decisions: [...(e.decisions ?? [])].sort(byCreatedAt).map((d) => ({
        id: d.id,
        classification: d.classification,
        decision: d.decision,
        refundRequestCount: d.refund_request_count,
        templateUsed: d.template_used,
        llmModel: d.llm_model,
        llmReasoning: d.llm_reasoning,
        status: d.status,
        draftReplyText: d.draft_reply_text,
        approvedAt: d.approved_at,
        approvedBy: d.approved_by,
        createdAt: d.created_at,
      })),
      audit: [...(e.audit_log ?? [])].sort(byCreatedAt).map((a) => ({
        id: a.id,
        action: a.action,
        status: a.status,
        error: a.error,
        createdAt: a.created_at,
      })),
    }))

  return {
    id: data.id,
    sender: data.sender_email,
    subject: data.subject,
    status: data.status,
    createdAt: data.created_at,
    emails,
  }
}

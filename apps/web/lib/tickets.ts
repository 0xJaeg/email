import type { ServerClient } from "@workspace/db/client"
import { sanitizeSearch } from "@/lib/search"

// ServerClient and BrowserClient are both SupabaseClient<Database> — this type
// accepts either. Imported as a type only (no secret-key runtime code).
type DbClient = ServerClient

export type TicketState = "open" | "done" | "all"

export type TicketRow = {
  id: string
  sender: string
  subject: string
  classification: string | null
  decision: string | null
  /** "open" (needs a human) or "done" (resolved) — computed by the view. */
  state: string
  createdAt: string
  // Latest decision's payload — lets an "open" row render the inline
  // approve/reject sheet without a second fetch.
  decisionId: string | null
  decisionStatus: string | null
  draftReplyText: string | null
  llmReasoning: string | null
  context: DecisionContext | null
  proposedActions: ProposedAction[]
  body: string | null
}

type TicketViewRow = {
  id: string
  sender_email: string
  subject: string
  created_at: string
  decision_id: string | null
  classification: string | null
  decision: string | null
  decision_status: string | null
  llm_reasoning: string | null
  draft_reply_text: string | null
  context: DecisionContext | null
  proposed_actions: ProposedAction[] | null
  body_text: string | null
  state: string
}

// Per-thread ticket list (one row = one conversation) from the `thread_tickets`
// view: the thread + its latest decision + a computed open/done state, so the
// page can filter by state and paginate. Replaces the separate Approvals
// (state="open") and Activity (state="done") pages.
export async function getTickets(
  client: DbClient,
  query: string,
  page: number,
  size: number,
  state: TicketState
): Promise<{ data: TicketRow[]; count: number }> {
  // thread_tickets is a Postgres view (not in the generated Database types);
  // query it untyped and map the rows. Its shape is owned by the migration
  // 20260624000002_thread_tickets_view.sql.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (client as any)
    .from("thread_tickets")
    .select(
      "id, sender_email, subject, created_at, decision_id, classification, decision, decision_status, llm_reasoning, draft_reply_text, context, proposed_actions, body_text, state",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })

  if (state !== "all") q = q.eq("state", state)

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
    data: ((data ?? []) as TicketViewRow[]).map((t) => ({
      id: t.id,
      sender: t.sender_email,
      subject: t.subject,
      classification: t.classification ?? null,
      decision: t.decision ?? null,
      state: t.state,
      createdAt: t.created_at,
      decisionId: t.decision_id ?? null,
      decisionStatus: t.decision_status ?? null,
      draftReplyText: t.draft_reply_text ?? null,
      llmReasoning: t.llm_reasoning ?? null,
      context: t.context ?? null,
      proposedActions: t.proposed_actions ?? [],
      body: t.body_text ?? null,
    })),
    count: count ?? 0,
  }
}

export type DecisionOrder = {
  orderId: string
  amount: number
  currency: string
  productName: string
  purchasedAt: string
}

export type DecisionAccess = {
  hasAccess: boolean
  details?: string
}

// One external API call the lookup made (captured by the worker), so the trace
// can show which APIs ran + how they answered — including errors.
export type DecisionLookup = {
  adapter: string
  operation: string
  ok: boolean
  summary: string
  endpoint?: string
  method?: string
  status?: number | null
  request?: string
  response?: string
}

export type DecisionContext = {
  orders?: DecisionOrder[]
  access?: DecisionAccess | null
  inquiry_type?: string
  lookups?: DecisionLookup[]
}

export type ProposedAction = {
  type: string
  reason?: string
}

// One node the worker walked, from flow_run_steps (the exact executed path).
export type FlowTraceStep = {
  seq: number
  nodeKey: string
  nodeType: string
  outcome: string | null
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
  context: DecisionContext | null
  proposedActions: ProposedAction[]
  // The exact flow path the worker walked for this decision's email. Empty for
  // decisions made before flow_runs existed — the trace falls back to inference.
  path: FlowTraceStep[]
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

// Pick the latest flow_run embedded under a decision and return its steps in
// execution order. Empty when the decision predates flow_runs (the ticket trace
// falls back to inference then).
function flowPathFromRuns(
  runs:
    | {
        created_at: string
        flow_run_steps:
          | {
              seq: number
              node_key: string
              node_type: string
              outcome: string | null
            }[]
          | null
      }[]
    | null
): FlowTraceStep[] {
  const run = [...(runs ?? [])].sort(byCreatedAt).at(-1)
  if (!run) return []
  return [...(run.flow_run_steps ?? [])]
    .sort((a, b) => a.seq - b.seq)
    .map((s) => ({
      seq: s.seq,
      nodeKey: s.node_key,
      nodeType: s.node_type,
      outcome: s.outcome,
    }))
}

// Full thread drill-down: the conversation's emails, each with its decisions
// and audit entries. One nested query (threads → emails → {decisions, audit_log}).
export async function getThreadDetail(
  client: DbClient,
  threadId: string
): Promise<ThreadDetail | null> {
  const { data, error } = await client
    .from("threads")
    .select(
      "id, sender_email, subject, status, created_at, emails(id, direction, from_email, to_email, subject, body_text, received_at, decisions(id, classification, decision, refund_request_count, template_used, llm_model, llm_reasoning, status, draft_reply_text, approved_at, approved_by, created_at, context, proposed_actions, flow_runs(created_at, flow_run_steps(seq, node_key, node_type, outcome))), audit_log(id, action, status, error, created_at))"
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
        context: (d.context ?? null) as DecisionContext | null,
        proposedActions: (d.proposed_actions ?? []) as ProposedAction[],
        path: flowPathFromRuns(d.flow_runs),
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

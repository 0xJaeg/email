import type { ServerClient } from "@workspace/db/client"
import { sanitizeSearch } from "@/lib/search"

type DbClient = ServerClient

export type EnrichmentContext = {
  inquiry_type?: string
  orders?: Array<{
    orderId?: string
    productName?: string
    amount?: number
    currency?: string
    purchasedAt?: string
  }>
  access?: { hasAccess?: boolean; details?: string | null }
}

export type ProposedActionRow = { type: string; reason?: string }

export type PendingApprovalRow = {
  id: string
  // "pending_approval" (an agent draft to approve/reject) or "needs_human"
  // (an escalation for a human to reply to manually).
  status: string
  threadId: string | null
  receivedAt: string
  sender: string
  subject: string
  body: string | null
  classification: string
  decision: string
  templateUsed: string | null
  llmReasoning: string | null
  draftReplyText: string | null
  context: EnrichmentContext | null
  proposedActions: ProposedActionRow[]
}

// The operator action queue: agent drafts awaiting approval AND escalations
// awaiting a manual reply, so nothing needing a human is hidden.
export async function fetchPendingApprovals(
  client: DbClient,
  query: string,
  page: number,
  size: number
): Promise<{ data: PendingApprovalRow[]; count: number }> {
  // emails!inner so a sender/subject search narrows the top-level decisions rows.
  let q = client
    .from("decisions")
    .select(
      "id, status, created_at, classification, decision, template_used, llm_reasoning, draft_reply_text, context, proposed_actions, emails!inner(from_email, subject, body_text, thread_id)",
      { count: "exact" }
    )
    .in("status", ["pending_approval", "needs_human"])
    .order("created_at", { ascending: false })

  const esc = sanitizeSearch(query)
  if (esc) {
    q = q.or(`from_email.ilike.%${esc}%,subject.ilike.%${esc}%`, {
      referencedTable: "emails",
    })
  }

  const { data, error, count } = await q.range(
    (page - 1) * size,
    page * size - 1
  )
  if (error) throw new Error(`fetchPendingApprovals: ${error.message}`)
  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      status: row.status ?? "",
      threadId: row.emails?.thread_id ?? null,
      receivedAt: row.created_at,
      sender: row.emails?.from_email ?? "(unknown)",
      subject: row.emails?.subject ?? "(no subject)",
      body: row.emails?.body_text ?? null,
      classification: row.classification ?? "",
      decision: row.decision ?? "",
      templateUsed: row.template_used,
      llmReasoning: row.llm_reasoning,
      draftReplyText: row.draft_reply_text,
      context: (row.context as EnrichmentContext | null) ?? null,
      proposedActions:
        (row.proposed_actions as ProposedActionRow[] | null) ?? [],
    })),
    count: count ?? 0,
  }
}

import type { ServerClient } from "@workspace/db/client"
import { sanitizeSearch } from "@/lib/search"

type DbClient = ServerClient

export type PendingApprovalRow = {
  id: string
  receivedAt: string
  sender: string
  subject: string
  classification: string
  decision: string
  templateUsed: string | null
  llmReasoning: string | null
  draftReplyText: string | null
}

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
      "id, created_at, classification, decision, template_used, llm_reasoning, draft_reply_text, emails!inner(from_email, subject)",
      { count: "exact" }
    )
    .eq("status", "pending_approval")
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
      receivedAt: row.created_at,
      sender: row.emails?.from_email ?? "(unknown)",
      subject: row.emails?.subject ?? "(no subject)",
      classification: row.classification ?? "",
      decision: row.decision ?? "",
      templateUsed: row.template_used,
      llmReasoning: row.llm_reasoning,
      draftReplyText: row.draft_reply_text,
    })),
    count: count ?? 0,
  }
}

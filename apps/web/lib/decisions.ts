import type { ServerClient } from "@workspace/db/client"

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
  client: DbClient
): Promise<PendingApprovalRow[]> {
  const { data, error } = await client
    .from("decisions")
    .select(
      "id, created_at, classification, decision, template_used, llm_reasoning, draft_reply_text, emails(from_email, subject)"
    )
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false })
  if (error) throw new Error(`fetchPendingApprovals: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id,
    receivedAt: row.created_at,
    sender: row.emails?.from_email ?? "(unknown)",
    subject: row.emails?.subject ?? "(no subject)",
    classification: row.classification ?? "",
    decision: row.decision ?? "",
    templateUsed: row.template_used,
    llmReasoning: row.llm_reasoning,
    draftReplyText: row.draft_reply_text,
  }))
}

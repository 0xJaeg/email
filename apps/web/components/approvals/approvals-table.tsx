import { getServerSupabase } from "@/lib/supabase/admin"
import { fetchPendingApprovals } from "@/lib/decisions"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { TablePagination } from "@/components/shared/table-pagination"
import { ReviewApprovalSheet } from "./review-approval-sheet"
import { EscalationReplySheet } from "./escalation-reply-sheet"

// The queue mixes reply drafts and refunds; surface which is which so an
// operator never approves a money-moving refund thinking it's a plain reply.
const DECISION_LABELS: Record<string, string> = {
  send_faq_reply: "FAQ reply",
  send_offer_1: "Offer (1st)",
  send_offer_2: "Offer (2nd)",
  issue_refund: "Refund",
  issue_refund_chargeback: "Refund (chargeback)",
  escalate: "Escalation",
}

export async function ApprovalsTable({
  query,
  page,
  size,
}: {
  query: string
  page: number
  size: number
}) {
  const { data, count } = await fetchPendingApprovals(
    getServerSupabase(),
    query,
    page,
    size
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Sender</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Draft reply</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  Nothing needs a human right now.
                </TableCell>
              </TableRow>
            ) : (
              data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-50 truncate font-medium">
                    {r.sender}
                  </TableCell>
                  <TableCell className="max-w-60 truncate text-muted-foreground">
                    {r.subject}
                  </TableCell>
                  <TableCell className="text-xs">
                    {DECISION_LABELS[r.decision] ?? r.decision}
                  </TableCell>
                  <TableCell className="max-w-96 truncate text-muted-foreground">
                    {r.status === "needs_human"
                      ? "Needs a manual reply"
                      : (r.draftReplyText ?? "(no draft)")}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2 text-right">
                    {r.status === "needs_human" ? (
                      <EscalationReplySheet
                        row={{
                          threadId: r.threadId,
                          sender: r.sender,
                          subject: r.subject,
                          body: r.body,
                          reasoning: r.llmReasoning,
                        }}
                      />
                    ) : (
                      <ReviewApprovalSheet
                        row={{
                          id: r.id,
                          sender: r.sender,
                          subject: r.subject,
                          decisionLabel:
                            DECISION_LABELS[r.decision] ?? r.decision,
                          body: r.body,
                          draftReplyText: r.draftReplyText,
                          context: r.context,
                          proposedActions: r.proposedActions,
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination page={page} pageSize={size} totalCount={count} />
    </div>
  )
}

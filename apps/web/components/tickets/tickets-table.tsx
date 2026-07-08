import Link from "next/link"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getTickets, type TicketState, type TicketOutcome } from "@/lib/tickets"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { TablePagination } from "@/components/shared/table-pagination"
import {
  ClassificationBadge,
  DecisionBadge,
} from "@/components/shared/status-badges"
import { ReviewApprovalSheet } from "@/components/approvals/review-approval-sheet"
import { EscalationReplySheet } from "@/components/approvals/escalation-reply-sheet"

// Human-readable decision label for the inline review sheet (so an operator
// never approves a money-moving refund thinking it's a plain reply).
const DECISION_LABELS: Record<string, string> = {
  send_faq_reply: "FAQ reply",
  send_offer_1: "Offer (1st)",
  send_offer_2: "Offer (2nd)",
  issue_refund: "Refund",
  issue_refund_chargeback: "Refund (chargeback)",
  escalate: "Escalation",
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export async function TicketsTable({
  query,
  page,
  size,
  state,
  outcome,
}: {
  query: string
  page: number
  size: number
  state: TicketState
  outcome?: TicketOutcome
}) {
  const { data, count } = await getTickets(
    getServerSupabase(),
    query,
    page,
    size,
    state,
    outcome
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Sender</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground"
                >
                  No tickets found.
                </TableCell>
              </TableRow>
            ) : (
              data.map((t) => (
                <TableRow key={t.id} className="hover:bg-muted/50">
                  <TableCell className="max-w-50 truncate font-medium">
                    {t.sender}
                  </TableCell>
                  <TableCell className="max-w-70 truncate text-muted-foreground">
                    <Link href={`/tickets/${t.id}`} className="hover:underline">
                      {t.subject}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ClassificationBadge value={t.classification} />
                  </TableCell>
                  <TableCell>
                    <DecisionBadge value={t.decision} />
                  </TableCell>
                  <TableCell>
                    {t.state === "done" ? (
                      <Badge variant="secondary">Done</Badge>
                    ) : (
                      <Badge>Open</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {formatDate(t.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {t.state !== "done" &&
                      t.decisionStatus === "needs_human" ? (
                        <EscalationReplySheet
                          row={{
                            threadId: t.id,
                            sender: t.sender,
                            subject: t.subject,
                            body: t.body,
                            reasoning: t.llmReasoning,
                          }}
                        />
                      ) : t.state !== "done" &&
                        t.decisionId &&
                        t.decisionStatus === "pending_approval" ? (
                        <ReviewApprovalSheet
                          row={{
                            id: t.decisionId,
                            sender: t.sender,
                            subject: t.subject,
                            decisionLabel:
                              DECISION_LABELS[t.decision ?? ""] ??
                              t.decision ??
                              "Reply",
                            body: t.body,
                            draftReplyText: t.draftReplyText,
                            context: t.context,
                            proposedActions: t.proposedActions,
                          }}
                        />
                      ) : null}
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/tickets/${t.id}`}>View</Link>
                      </Button>
                    </div>
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

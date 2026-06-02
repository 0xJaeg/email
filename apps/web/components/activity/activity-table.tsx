import Link from "next/link"
import { IconChevronRight } from "@tabler/icons-react"
import { getServerSupabase } from "@/lib/supabase/admin"
import { fetchActivity } from "@/lib/tickets"
import { humanizeAction, humanizeError } from "@/lib/activity-format"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { TablePagination } from "@/components/shared/table-pagination"
import { AuditStatusBadge } from "@/components/shared/status-badges"

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export async function ActivityTable({
  query,
  page,
  size,
}: {
  query: string
  page: number
  size: number
}) {
  const { data, count } = await fetchActivity(
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
              <TableHead>Action</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-10 text-center text-muted-foreground"
                >
                  No activity found
                </TableCell>
              </TableRow>
            ) : (
              data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {humanizeAction(r.action)}
                  </TableCell>
                  <TableCell>
                    <AuditStatusBadge value={r.status} />
                  </TableCell>
                  <TableCell className="max-w-90 text-muted-foreground">
                    {r.replyText ? (
                      // The agent's sent reply — peek in the summary, expand for full text.
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-1 truncate hover:text-foreground [&::-webkit-details-marker]:hidden">
                          <IconChevronRight className="size-3 shrink-0 transition-transform group-open:rotate-90" />
                          <span className="truncate">
                            {r.sender
                              ? `Replied to ${r.sender}`
                              : "View sent reply"}
                            {r.subject ? ` — “${r.subject}”` : ""}
                          </span>
                        </summary>
                        <div className="mt-2 rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap text-foreground">
                          {r.replyText}
                        </div>
                      </details>
                    ) : r.error ? (
                      // Friendly text for the operator; raw error on hover for us.
                      <span className="block truncate" title={r.error}>
                        {humanizeError(r.error)}
                      </span>
                    ) : r.sender ? (
                      r.threadId ? (
                        <Link
                          href={`/tickets/${r.threadId}`}
                          className="block truncate hover:text-foreground hover:underline"
                        >
                          {r.sender}
                          {r.subject ? ` — “${r.subject}”` : ""}
                        </Link>
                      ) : (
                        <span className="block truncate">
                          {r.sender}
                          {r.subject ? ` — “${r.subject}”` : ""}
                        </span>
                      )
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell
                    suppressHydrationWarning
                    className="text-right text-muted-foreground tabular-nums"
                  >
                    {formatTime(r.createdAt)}
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

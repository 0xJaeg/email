import Link from "next/link"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getTickets } from "@/lib/tickets"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { TablePagination } from "@/components/shared/table-pagination"
import {
  ClassificationBadge,
  DecisionBadge,
  ThreadStatusBadge,
} from "@/components/shared/status-badges"

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
}: {
  query: string
  page: number
  size: number
}) {
  const { data, count } = await getTickets(
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
              <TableHead>Classification</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-10 text-center"
                >
                  No tickets found.
                </TableCell>
              </TableRow>
            ) : (
              data.map((t) => (
                <TableRow
                  key={t.id}
                  className="hover:bg-muted/50 relative cursor-pointer"
                >
                  <TableCell className="max-w-50 truncate font-medium">
                    {t.sender}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-70 truncate">
                    <Link
                      href={`/tickets/${t.id}`}
                      className="after:absolute after:inset-0"
                    >
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
                    <ThreadStatusBadge value={t.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {formatDate(t.createdAt)}
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

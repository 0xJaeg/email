"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { getBrowserSupabase } from "@/lib/supabase/client"
import { fetchTickets, type TicketRow } from "@/lib/tickets"
import {
  ClassificationBadge,
  DecisionBadge,
  ThreadStatusBadge,
} from "./status-badges"

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function TicketsTable({ initial }: { initial: TicketRow[] }) {
  const [rows, setRows] = useState<TicketRow[]>(initial)

  const refetch = useCallback(async () => {
    try {
      setRows(await fetchTickets(getBrowserSupabase()))
    } catch (err) {
      console.error("[tickets] realtime refetch failed", err)
    }
  }, [])

  useEffect(() => {
    const supabase = getBrowserSupabase()
    const channel = supabase
      .channel("tickets-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "emails" },
        () => refetch()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decisions" },
        () => refetch()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refetch])

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead>Sender</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Classification</TableHead>
            <TableHead>Decision</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Received</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-10 text-center text-muted-foreground"
              >
                No emails yet — send one with{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  pnpm sim
                </code>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="max-w-50 truncate font-medium">
                  {r.sender}
                </TableCell>
                <TableCell className="max-w-70 truncate text-muted-foreground">
                  {r.subject}
                </TableCell>
                <TableCell>
                  <ClassificationBadge value={r.classification} />
                </TableCell>
                <TableCell>
                  <DecisionBadge value={r.decision} />
                </TableCell>
                <TableCell>
                  <ThreadStatusBadge value={r.threadStatus} />
                </TableCell>
                <TableCell
                  suppressHydrationWarning
                  className="text-right tabular-nums text-muted-foreground"
                >
                  {formatTime(r.receivedAt)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

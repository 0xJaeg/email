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
import { getBrowserSupabase } from "@/lib/supabase-browser"
import { fetchActivity, type ActivityRow } from "@/lib/tickets"
import { AuditStatusBadge } from "./status-badges"

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function ActivityLog({ initial }: { initial: ActivityRow[] }) {
  const [rows, setRows] = useState<ActivityRow[]>(initial)

  const refetch = useCallback(async () => {
    try {
      setRows(await fetchActivity(getBrowserSupabase()))
    } catch (err) {
      console.error("[activity] realtime refetch failed", err)
    }
  }, [])

  useEffect(() => {
    const supabase = getBrowserSupabase()
    const channel = supabase
      .channel("activity-log")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_log" },
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
        <TableHeader>
          <TableRow>
            <TableHead>Action</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Detail</TableHead>
            <TableHead className="text-right">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="py-10 text-center text-muted-foreground"
              >
                No activity yet
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.action}</TableCell>
                <TableCell>
                  <AuditStatusBadge value={r.status} />
                </TableCell>
                <TableCell className="max-w-[360px] truncate text-muted-foreground">
                  {r.error ?? r.emailId ?? "—"}
                </TableCell>
                <TableCell
                  suppressHydrationWarning
                  className="text-right tabular-nums text-muted-foreground"
                >
                  {formatTime(r.createdAt)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

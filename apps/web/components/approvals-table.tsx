"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Button } from "@workspace/ui/components/button"
import { approveRefund, rejectRefund } from "@/lib/approvals"
import type { PendingApprovalRow } from "@/lib/decisions"

export function ApprovalsTable({ initial }: { initial: PendingApprovalRow[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)

  if (initial.length === 0) {
    return (
      <div className="rounded-lg border p-10 text-center text-muted-foreground">
        No refunds awaiting approval.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead>Sender</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Draft reply</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {initial.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="max-w-50 truncate font-medium">
                {r.sender}
              </TableCell>
              <TableCell className="max-w-60 truncate text-muted-foreground">
                {r.subject}
              </TableCell>
              <TableCell className="text-xs">{r.templateUsed ?? "-"}</TableCell>
              <TableCell className="max-w-96 truncate text-muted-foreground">
                {r.draftReplyText ?? "(no draft)"}
              </TableCell>
              <TableCell className="flex justify-end gap-2 text-right">
                <Button
                  variant="default"
                  size="sm"
                  disabled={pendingId !== null}
                  onClick={async () => {
                    setPendingId(r.id)
                    try {
                      await approveRefund(r.id)
                      router.refresh()
                    } finally {
                      setPendingId(null)
                    }
                  }}
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pendingId !== null}
                  onClick={async () => {
                    setPendingId(r.id)
                    try {
                      await rejectRefund(r.id)
                      router.refresh()
                    } finally {
                      setPendingId(null)
                    }
                  }}
                >
                  Reject
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

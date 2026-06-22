"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { approveDecision, rejectDecision } from "@/lib/approvals"
import type { ThreadDecision } from "@/lib/tickets"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  IconLoader2,
  IconReceiptRefund,
  IconBellOff,
} from "@tabler/icons-react"

function actionLabel(type: string, reason?: string): string {
  if (type === "issue_refund") return "Issue a refund to the customer"
  if (type === "suppress_contact")
    return "Stop marketing emails to this address" + (reason ? ` (${reason})` : "")
  return type
}

// Inline review of the agent's pending draft on the ticket page — the SAME
// edit + approve/reject flow as /approvals (approveDecision / rejectDecision),
// so the draft is actionable where you're reading the ticket. Approving sends
// the (edited) reply and runs the proposed actions; rejecting drops it.
export function TicketDraftReview({ decision }: { decision: ThreadDecision }) {
  const router = useRouter()
  const [draft, setDraft] = useState(decision.draftReplyText ?? "")
  const [isPending, startTransition] = useTransition()
  const actions = decision.proposedActions ?? []

  function onApprove() {
    if (isPending) return
    if (!draft.trim()) {
      toast.error("The reply can't be empty.")
      return
    }
    startTransition(async () => {
      try {
        await approveDecision(decision.id, draft)
        toast.success("Approved — reply sent.")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Approval failed.")
      }
    })
  }

  function onReject() {
    if (isPending) return
    startTransition(async () => {
      try {
        await rejectDecision(decision.id)
        toast.success("Rejected.")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reject failed.")
      }
    })
  }

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="flex items-center gap-2 font-heading text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Drafted reply · awaiting your approval
      </h2>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={isPending}
        className="min-h-40 text-sm"
      />
      {actions.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {actions.map((a, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive"
            >
              {a.type === "issue_refund" ? (
                <IconReceiptRefund className="size-4 shrink-0" />
              ) : (
                <IconBellOff className="size-4 shrink-0" />
              )}
              {actionLabel(a.type, a.reason)}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Edit the reply if needed — your edits are what get sent. Approving
          sends it immediately
          {actions.length > 0 ? " and runs the actions above" : ""}.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={onReject} disabled={isPending}>
            Reject
          </Button>
          <Button onClick={onApprove} disabled={isPending}>
            {isPending ? (
              <IconLoader2 className="animate-spin" />
            ) : (
              "Approve & send"
            )}
          </Button>
        </div>
      </div>
    </section>
  )
}

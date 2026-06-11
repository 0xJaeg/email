"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { approveDecision, rejectDecision } from "@/lib/approvals"
import type {
  EnrichmentContext,
  ProposedActionRow,
} from "@/lib/decisions"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { Label } from "@workspace/ui/components/label"
import {
  IconLoader2,
  IconEye,
  IconReceiptRefund,
  IconBellOff,
  IconCircleCheck,
  IconCircleX,
} from "@tabler/icons-react"

export type ReviewRow = {
  id: string
  sender: string
  subject: string
  decisionLabel: string
  body: string | null
  draftReplyText: string | null
  context: EnrichmentContext | null
  proposedActions: ProposedActionRow[]
}

// What each proposed action means in plain language + whether it's "heavy"
// (money moves / outbound suppression) so the reviewer can't miss it.
function describeAction(a: ProposedActionRow): {
  label: string
  heavy: boolean
  icon: typeof IconReceiptRefund
} {
  if (a.type === "issue_refund")
    return { label: "Issue a refund to the customer", heavy: true, icon: IconReceiptRefund }
  if (a.type === "suppress_contact")
    return {
      label: "Stop marketing emails to this address" + (a.reason ? ` (${a.reason})` : ""),
      heavy: true,
      icon: IconBellOff,
    }
  return { label: a.type, heavy: false, icon: IconReceiptRefund }
}

export function ReviewApprovalSheet({ row }: { row: ReviewRow }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(row.draftReplyText ?? "")
  const [isPending, startTransition] = useTransition()

  function onApprove() {
    if (isPending) return
    if (!draft.trim()) {
      toast.error("The reply can't be empty.")
      return
    }
    startTransition(async () => {
      try {
        await approveDecision(row.id, draft)
        toast.success("Approved — reply sent.")
        setOpen(false)
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
        await rejectDecision(row.id)
        toast.success("Rejected.")
        setOpen(false)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reject failed.")
      }
    })
  }

  const ctx = row.context
  const order = ctx?.orders?.[0]
  const access = ctx?.access
  const hasFindings = Boolean(ctx && (ctx.orders?.length || ctx.access))

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="default"
        size="sm"
        onClick={() => {
          setDraft(row.draftReplyText ?? "")
          setOpen(true)
        }}
      >
        <IconEye className="size-4" />
        Review
      </Button>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-250!">
        <SheetHeader className="border-b">
          <SheetTitle>{row.decisionLabel}</SheetTitle>
          <SheetDescription>
            To {row.sender} · {row.subject}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 px-4">
          {/* What the customer wrote */}
          {row.body ? (
            <section className="flex flex-col gap-1.5">
              <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                Customer&apos;s message
              </h3>
              <p className="bg-muted max-h-40 overflow-y-auto rounded-lg border p-3 text-sm whitespace-pre-wrap">
                {row.body}
              </p>
            </section>
          ) : null}

          {/* What the assistant verified */}
          {hasFindings ? (
            <section className="flex flex-col gap-1.5">
              <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                What the assistant checked
              </h3>
              <div className="flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
                {order ? (
                  <p>
                    <span className="font-medium">Purchase:</span>{" "}
                    {order.productName ?? "Product"}
                    {order.amount != null
                      ? ` — ${order.amount} ${order.currency ?? ""}`.trimEnd()
                      : ""}
                    {order.purchasedAt ? `, ${order.purchasedAt}` : ""}
                    {order.orderId ? ` (order ${order.orderId})` : ""}
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    No purchase found for this email.
                  </p>
                )}
                {access ? (
                  <p className="flex items-center gap-1.5">
                    {access.hasAccess ? (
                      <IconCircleCheck className="size-4 text-emerald-600" />
                    ) : (
                      <IconCircleX className="text-destructive size-4" />
                    )}
                    <span>
                      {access.hasAccess
                        ? "Account access is active"
                        : "No account access found"}
                    </span>
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* What will happen on approve */}
          {row.proposedActions.length > 0 ? (
            <section className="flex flex-col gap-1.5">
              <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                When you approve, this also happens
              </h3>
              <ul className="flex flex-col gap-1.5">
                {row.proposedActions.map((a, i) => {
                  const d = describeAction(a)
                  const Icon = d.icon
                  return (
                    <li
                      key={i}
                      className={
                        d.heavy
                          ? "border-destructive/30 bg-destructive/5 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
                          : "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                      }
                    >
                      <Icon className="size-4 shrink-0" />
                      {d.label}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {/* The editable reply */}
          <section className="flex flex-1 flex-col gap-2">
            <Label htmlFor="draft">Reply to send</Label>
            <Textarea
              id="draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={isPending}
              className="max-h-[45vh] min-h-[30vh] flex-1 overflow-y-auto text-sm"
            />
            <p className="text-muted-foreground text-xs">
              Edit the reply before approving if needed — your edits are what get
              sent. Approving sends the email immediately
              {row.proposedActions.length > 0
                ? " and runs the actions above"
                : ""}
              .
            </p>
          </section>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t">
          <Button variant="outline" disabled={isPending} onClick={onReject}>
            Reject
          </Button>
          <Button disabled={isPending} onClick={onApprove}>
            {isPending ? (
              <IconLoader2 className="animate-spin" />
            ) : (
              "Approve & send"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

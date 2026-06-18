"use client"

import { useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Button } from "@workspace/ui/components/button"
import { IconMessage } from "@tabler/icons-react"
import { EmailBody } from "@/components/tickets/email-body"
import { ManualReply } from "@/components/tickets/manual-reply"

export type EscalationRow = {
  threadId: string | null
  sender: string
  subject: string
  body: string | null
  reasoning: string | null
}

// The approvals-queue action for an escalation (needs_human): there's no draft
// to approve, so it opens a sheet with the customer's message + why the agent
// escalated, and a composer to reply manually. Sending closes the sheet and
// refreshes the queue (the row moves to "sent" and drops out).
export function EscalationReplySheet({ row }: { row: EscalationRow }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="default" size="sm" onClick={() => setOpen(true)}>
        <IconMessage className="size-4" />
        Reply
      </Button>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-250">
        <SheetHeader className="border-b">
          <SheetTitle>Escalation — reply manually</SheetTitle>
          <SheetDescription>
            To {row.sender} · {row.subject}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 px-4 pb-4">
          {row.body ? (
            <section className="flex flex-col gap-1.5">
              <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Customer&apos;s message
              </h3>
              <div className="max-h-48 overflow-y-auto rounded-lg border bg-muted p-3 text-sm">
                <EmailBody text={row.body} />
              </div>
            </section>
          ) : null}
          {row.reasoning ? (
            <section className="flex flex-col gap-1.5">
              <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Why the agent escalated
              </h3>
              <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                {row.reasoning}
              </p>
            </section>
          ) : null}
          {row.threadId ? (
            <ManualReply
              threadId={row.threadId}
              onSent={() => setOpen(false)}
            />
          ) : (
            <p className="text-sm text-destructive">
              This ticket has no thread to reply to.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { sendManualReply } from "@/lib/manual-reply"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { IconLoader2, IconSend } from "@tabler/icons-react"

// A human takes over and replies in their own words — primarily for escalated
// (needs_human) tickets the agent didn't draft. Sends immediately from the
// thread's registered inbox.
export function ManualReply({
  threadId,
  onSent,
}: {
  threadId: string
  onSent?: () => void
}) {
  const router = useRouter()
  const [text, setText] = useState("")
  const [isPending, startTransition] = useTransition()

  function onSend() {
    if (isPending) return
    if (!text.trim()) {
      toast.error("The reply can't be empty.")
      return
    }
    startTransition(async () => {
      const r = await sendManualReply(threadId, text)
      if (r.error) {
        toast.error(r.message)
      } else {
        toast.success(r.message)
        setText("")
        router.refresh()
        onSent?.()
      }
    })
  }

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="flex items-center gap-2 font-heading text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Reply to customer
      </h2>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a reply to send from this inbox…"
        disabled={isPending}
        className="min-h-32 text-sm"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Sends immediately from the thread&apos;s inbox — use this to handle
          escalated tickets the agent didn&apos;t draft.
        </p>
        <Button onClick={onSend} disabled={isPending} className="shrink-0">
          {isPending ? (
            <IconLoader2 className="animate-spin" />
          ) : (
            <>
              <IconSend className="size-4" />
              Send reply
            </>
          )}
        </Button>
      </div>
    </section>
  )
}

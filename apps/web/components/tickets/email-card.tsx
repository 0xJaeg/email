import {
  ClassificationBadge,
  DecisionBadge,
} from "@/components/shared/status-badges"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import { IconArrowRight, IconMail, IconRobot } from "@tabler/icons-react"
import type { ThreadEmail } from "@/lib/tickets"

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function initial(name: string): string {
  return (name.trim().match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase()
}

// Label the agent's reply by what happened to it.
function replyLabel(status: string): string {
  switch (status) {
    case "sent":
    case "approved":
      return "Agent reply · sent"
    case "pending_approval":
      return "Drafted reply · awaiting approval"
    case "failed":
      return "Reply draft · send failed"
    case "rejected":
      return "Drafted reply · rejected"
    default:
      return "Agent reply"
  }
}

// One email in the thread's conversation timeline.
export function EmailCard({
  email,
  isLast,
}: {
  email: ThreadEmail
  isLast: boolean
}) {
  const inbound = email.direction === "inbound"

  return (
    <li className="relative flex gap-3.5">
      <div className={cn("min-w-0 flex-1", !isLast && "pb-6")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{email.from}</span>
          <Badge variant={inbound ? "secondary" : "outline"}>
            {email.direction}
          </Badge>
          <span
            suppressHydrationWarning
            className="ml-auto text-xs text-muted-foreground tabular-nums"
          >
            {formatDateTime(email.receivedAt)}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          to <span className="font-heading">{email.to}</span>
        </p>

        <div
          className={cn(
            "mt-2.5 rounded-xl border p-3.5 text-sm leading-relaxed",
            inbound && "bg-muted"
          )}
        >
          {email.subject ? (
            <div className="mb-2 flex items-center gap-1.5 font-heading text-[11px] tracking-wide text-muted-foreground uppercase">
              <IconMail className="size-3" />
              Subject — {email.subject}
            </div>
          ) : null}
          <p className="whitespace-pre-wrap">
            {email.bodyText ?? "(no text body)"}
          </p>
        </div>

        {email.decisions.map((d) => (
          <div key={d.id} className="mt-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
              <IconRobot className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Agent responded</span>
              <ClassificationBadge value={d.classification} />
              <IconArrowRight className="size-3 text-muted-foreground" />
              <DecisionBadge value={d.decision} />
            </div>
            {d.draftReplyText ? (
              <div className="rounded-xl border bg-background p-3.5 text-sm leading-relaxed">
                <div className="mb-2 flex items-center gap-1.5 font-heading text-[11px] tracking-wide text-muted-foreground uppercase">
                  <IconRobot className="size-3" />
                  {replyLabel(d.status)}
                </div>
                <p className="whitespace-pre-wrap">{d.draftReplyText}</p>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </li>
  )
}

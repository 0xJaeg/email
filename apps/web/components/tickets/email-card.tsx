import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import {
  ClassificationBadge,
  DecisionBadge,
} from "@/components/shared/status-badges"
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
      <div className="flex flex-col items-center">
        <Avatar className="size-9 rounded-[9px] border">
          <AvatarFallback
            className={cn(
              "rounded-[9px] text-xs",
              !inbound && "bg-primary text-primary-foreground"
            )}
          >
            {initial(email.from)}
          </AvatarFallback>
        </Avatar>
        {!isLast && <div className="bg-border mt-1 w-px flex-1" />}
      </div>

      <div className={cn("min-w-0 flex-1", !isLast && "pb-6")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{email.from}</span>
          <Badge variant={inbound ? "secondary" : "outline"}>
            {email.direction}
          </Badge>
          <span
            suppressHydrationWarning
            className="text-muted-foreground ml-auto text-xs tabular-nums"
          >
            {formatDateTime(email.receivedAt)}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 truncate text-xs">
          to <span className="font-heading">{email.to}</span>
        </p>

        <div
          className={cn(
            "mt-2.5 rounded-xl border p-3.5 text-sm leading-relaxed",
            inbound ? "bg-muted" : "border-l-primary border-l-[2.5px]"
          )}
        >
          {email.subject ? (
            <div className="text-muted-foreground font-heading mb-2 flex items-center gap-1.5 text-[11px] tracking-wide uppercase">
              <IconMail className="size-3" />
              Subject — {email.subject}
            </div>
          ) : null}
          <p className="whitespace-pre-wrap">
            {email.bodyText ?? "(no text body)"}
          </p>
        </div>

        {email.decisions.map((d) => (
          <div
            key={d.id}
            className="border-border bg-muted/40 mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs"
          >
            <IconRobot className="text-muted-foreground size-3.5" />
            <span className="text-muted-foreground">Agent responded</span>
            <ClassificationBadge value={d.classification} />
            <IconArrowRight className="text-muted-foreground size-3" />
            <DecisionBadge value={d.decision} />
          </div>
        ))}
      </div>
    </li>
  )
}

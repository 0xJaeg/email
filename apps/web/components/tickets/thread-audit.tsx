import { AuditStatusBadge } from "@/components/shared/status-badges"
import { humanizeAction, humanizeError } from "@/lib/activity-format"
import { cn } from "@workspace/ui/lib/utils"
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconX,
} from "@tabler/icons-react"
import type { ThreadAudit as ThreadAuditEntry } from "@/lib/tickets"

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function StepDot({ status }: { status: string }) {
  if (status === "success")
    return (
      <span className="grid size-6 place-items-center rounded-full bg-emerald-500 text-white">
        <IconCheck className="size-3.5" stroke={2.5} />
      </span>
    )
  if (status === "failure")
    return (
      <span className="bg-destructive text-background dark:text-background grid size-6 place-items-center rounded-full">
        <IconX className="size-3.5" stroke={2.5} />
      </span>
    )
  return (
    <span className="bg-background text-muted-foreground grid size-6 place-items-center rounded-full border">
      <IconClock className="size-3.5" />
    </span>
  )
}

// The agent's run, step by step. A failed step is impossible to miss.
export function ThreadAudit({ entries }: { entries: ThreadAuditEntry[] }) {
  if (entries.length === 0) return null

  return (
    <section className="flex flex-col gap-3.5">
      <h2 className="text-muted-foreground font-heading text-[11px] font-semibold tracking-wider uppercase">
        What the assistant did
      </h2>
      <ol className="bg-card divide-border divide-y rounded-xl border">
        {entries.map((a, i) => (
          <li
            key={a.id}
            className={cn(
              "flex gap-3.5 px-4 py-3.5",
              a.status === "failure" && "bg-destructive/5"
            )}
          >
            <div className="flex flex-col items-center">
              <StepDot status={a.status} />
              {i < entries.length - 1 && (
                <span className="bg-border mt-1 w-px flex-1" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-heading text-sm font-medium" title={a.action}>
                  {humanizeAction(a.action)}
                </span>
                <AuditStatusBadge value={a.status} />
                <span
                  suppressHydrationWarning
                  className="text-muted-foreground ml-auto text-xs tabular-nums"
                >
                  {formatDateTime(a.createdAt)}
                </span>
              </div>
              {a.error ? (
                <div className="text-destructive flex items-center gap-1.5 text-xs">
                  <IconAlertCircle className="size-3.5 shrink-0" />
                  <span
                    className="bg-destructive/10 font-heading rounded px-1.5 py-0.5 text-[11px]"
                    title={a.error}
                  >
                    {humanizeError(a.error)}
                  </span>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

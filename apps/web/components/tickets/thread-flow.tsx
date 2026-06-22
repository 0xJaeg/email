import { cn } from "@workspace/ui/lib/utils"
import { IconCheck, IconClock, IconX, IconMinus } from "@tabler/icons-react"
import { humanizeAction } from "@/lib/activity-format"
import {
  ClassificationBadge,
  DecisionBadge,
} from "@/components/shared/status-badges"
import type { FlowStep, FlowStepStatus } from "@/lib/flow-trace"

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function StepDot({ status }: { status: FlowStepStatus }) {
  if (status === "failed")
    return (
      <span className="grid size-6 place-items-center rounded-full bg-destructive text-background dark:text-background">
        <IconX className="size-3.5" stroke={2.5} />
      </span>
    )
  if (status === "pending")
    return (
      <span className="grid size-6 place-items-center rounded-full border bg-background text-muted-foreground">
        <IconClock className="size-3.5" />
      </span>
    )
  if (status === "info")
    return (
      <span className="grid size-6 place-items-center rounded-full border bg-background text-muted-foreground">
        <IconMinus className="size-3.5" />
      </span>
    )
  return (
    <span className="grid size-6 place-items-center rounded-full bg-emerald-500 text-white">
      <IconCheck className="size-3.5" stroke={2.5} />
    </span>
  )
}

function StepDetail({ detail }: { detail: FlowStep["detail"] }) {
  if (!detail) return null
  if (detail.kind === "text")
    return <p className="text-sm text-muted-foreground">{detail.text}</p>
  if (detail.kind === "classification")
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Classified as</span>
        <ClassificationBadge value={detail.value} />
      </div>
    )
  if (detail.kind === "decision")
    return (
      <div className="flex flex-col gap-2">
        <DecisionBadge value={detail.value} />
        {detail.reasoning ? (
          <p className="max-w-[60ch] border-l-2 border-border pl-3 text-sm text-muted-foreground italic">
            “{detail.reasoning}”
          </p>
        ) : null}
      </div>
    )
  if (detail.kind === "order-access")
    return (
      <div className="flex flex-col gap-2">
        {detail.lookups.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {detail.lookups.map((l, i) => (
              <li
                key={i}
                className={cn(
                  "flex flex-wrap items-center gap-1.5 font-heading text-xs",
                  l.ok ? "text-muted-foreground" : "text-destructive"
                )}
              >
                <span className="font-medium">{l.adapter}</span>·
                <span>
                  {l.operation === "order_lookup"
                    ? "order lookup"
                    : "access check"}
                </span>
                {l.endpoint ? (
                  <span className="font-mono opacity-80">
                    {l.method ? `${l.method} ` : ""}
                    {l.endpoint}
                    {l.status != null ? ` → ${l.status}` : ""}
                  </span>
                ) : null}
                <span>· {l.ok ? l.summary : `⚠ ${l.summary}`}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {detail.orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No matching order found.
          </p>
        ) : (
          detail.orders.map((o) => (
            <div
              key={o.orderId}
              className="flex w-fit flex-wrap gap-x-3.5 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            >
              <span className="font-medium text-foreground">{o.orderId}</span>
              <span>
                {o.currency} {o.amount}
              </span>
              <span>{o.productName}</span>
              <span>purchased {o.purchasedAt}</span>
            </div>
          ))
        )}
        {detail.access ? (
          <p
            className={cn(
              "text-sm",
              detail.access.hasAccess
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            )}
          >
            {detail.access.hasAccess ? "✓ Access active" : "✗ No access"} —{" "}
            {detail.access.details}
          </p>
        ) : null}
      </div>
    )
  if (detail.kind === "actions") {
    if (detail.actions.length === 0)
      return <p className="text-sm text-muted-foreground">None — reply only.</p>
    return (
      <div className="flex flex-wrap gap-2">
        {detail.actions.map((a, i) => (
          <span
            key={`${a.type}-${i}`}
            className="w-fit rounded-md bg-muted px-2 py-1 text-xs text-foreground"
          >
            {humanizeAction(a.type)}
          </span>
        ))}
      </div>
    )
  }
  return null
}

// The agent's run on this ticket, step by step, with what each step found.
export function ThreadFlow({ steps }: { steps: FlowStep[] }) {
  if (steps.length === 0) return null

  return (
    <section className="flex flex-col gap-3.5">
      <h2 className="font-heading text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        What the assistant did
      </h2>
      <ol className="divide-y divide-border rounded-xl border bg-card">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className={cn(
              "flex gap-3.5 px-4 py-3.5",
              s.status === "failed" && "bg-destructive/5"
            )}
          >
            <div className="flex flex-col items-center">
              <StepDot status={s.status} />
              {i < steps.length - 1 && (
                <span className="mt-1 w-px flex-1 bg-border" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-heading text-sm font-medium">
                  {s.title}
                </span>
                {s.timestamp ? (
                  <span
                    suppressHydrationWarning
                    className="ml-auto text-xs text-muted-foreground tabular-nums"
                  >
                    {formatDateTime(s.timestamp)}
                  </span>
                ) : null}
              </div>
              <StepDetail detail={s.detail} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

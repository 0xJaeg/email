import { cn } from "@workspace/ui/lib/utils"
import { IconCheck, IconClock, IconX, IconMinus } from "@tabler/icons-react"
import { humanizeAction } from "@/lib/activity-format"
import { ClassificationBadge, DecisionBadge } from "@/components/shared/status-badges"
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
      <span className="bg-destructive text-background dark:text-background grid size-6 place-items-center rounded-full">
        <IconX className="size-3.5" stroke={2.5} />
      </span>
    )
  if (status === "pending")
    return (
      <span className="bg-background text-muted-foreground grid size-6 place-items-center rounded-full border">
        <IconClock className="size-3.5" />
      </span>
    )
  if (status === "info")
    return (
      <span className="bg-background text-muted-foreground grid size-6 place-items-center rounded-full border">
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
    return <p className="text-muted-foreground text-sm">{detail.text}</p>
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
          <p className="text-muted-foreground border-border max-w-[60ch] border-l-2 pl-3 text-sm italic">
            "{detail.reasoning}"
          </p>
        ) : null}
      </div>
    )
  if (detail.kind === "order-access")
    return (
      <div className="flex flex-col gap-2">
        {detail.orders.length === 0 ? (
          <p className="text-muted-foreground text-sm">No matching order found.</p>
        ) : (
          detail.orders.map((o) => (
            <div
              key={o.orderId}
              className="bg-muted/40 text-muted-foreground flex w-fit flex-wrap gap-x-3.5 gap-y-1 rounded-lg border px-3 py-2 text-sm"
            >
              <span className="text-foreground font-medium">{o.orderId}</span>
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
      return <p className="text-muted-foreground text-sm">None — reply only.</p>
    return (
      <div className="flex flex-wrap gap-2">
        {detail.actions.map((a, i) => (
          <span
            key={`${a.type}-${i}`}
            className="bg-muted text-foreground w-fit rounded-md px-2 py-1 text-xs"
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
      <h2 className="text-muted-foreground font-heading text-[11px] font-semibold tracking-wider uppercase">
        What the assistant did
      </h2>
      <ol className="bg-card divide-border divide-y rounded-xl border">
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
                <span className="bg-border mt-1 w-px flex-1" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-heading text-sm font-medium">{s.title}</span>
                {s.timestamp ? (
                  <span
                    suppressHydrationWarning
                    className="text-muted-foreground ml-auto text-xs tabular-nums"
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

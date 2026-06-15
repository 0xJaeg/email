import { Badge } from "@workspace/ui/components/badge"
import { IconArrowDown } from "@tabler/icons-react"
import type { FlowStepRow } from "@/lib/flow-steps"

// Renders the decision flow as a numbered top-to-bottom sequence of steps —
// the exact order the worker runs them. Read-only (editing is Increment 2).
export function FlowView({ steps }: { steps: FlowStepRow[] }) {
  if (!steps.length) {
    return (
      <p className="text-muted-foreground text-sm">
        No flow configured for this inbox.
      </p>
    )
  }
  return (
    <ol className="flex flex-col items-center gap-0">
      {steps.map((step, i) => (
        <li key={step.id} className="flex w-full max-w-2xl flex-col items-center">
          <div className="bg-card w-full rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                  {step.position}
                </span>
                <h3 className="text-sm font-semibold">{step.title}</h3>
              </div>
              <div className="flex items-center gap-1.5">
                {!step.is_active && <Badge variant="secondary">inactive</Badge>}
                <Badge variant="outline" className="font-mono text-[10px]">
                  {step.step_key}
                </Badge>
              </div>
            </div>
            {step.description ? (
              <p className="text-muted-foreground mt-2 text-sm">
                {step.description}
              </p>
            ) : null}
          </div>
          {i < steps.length - 1 ? (
            <IconArrowDown className="text-muted-foreground my-1.5 size-4" />
          ) : null}
        </li>
      ))}
    </ol>
  )
}

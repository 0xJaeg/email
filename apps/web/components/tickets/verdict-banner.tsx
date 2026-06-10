import { Card } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconClock,
  IconRobot,
} from "@tabler/icons-react"
import { humanizeDecisionStatus } from "@/lib/activity-format"
import type { ThreadDecision } from "@/lib/tickets"

// Verb-form headline for the verdict (the small chips still use DecisionBadge).
const DECISION_HEADLINE: Record<string, string> = {
  send_offer_1: "Send Offer 1",
  send_offer_2: "Send Offer 2",
  issue_refund: "Issue refund",
  issue_refund_chargeback: "Issue refund · chargeback",
  send_faq_reply: "Send FAQ reply",
  escalate: "Escalate to a human",
}

function classificationLabel(value: string | null): string {
  if (value === "refund_request") return "refund request"
  if (value === "faq") return "FAQ"
  if (!value) return "unclassified"
  return value
}

// Restrained semantic accent — same palette the shared status badges use.
function accentClass(decision: string | null): string {
  if (!decision) return "bg-border"
  if (decision.startsWith("issue_refund")) return "bg-destructive"
  if (decision.startsWith("send_offer")) return "bg-amber-500"
  if (decision === "send_faq_reply") return "bg-blue-500"
  return "bg-primary"
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// The page hero: what the agent decided, why, and whether it landed.
export function VerdictBanner({
  decision,
}: {
  decision: ThreadDecision | null
}) {
  if (!decision) {
    return (
      <Card className="text-muted-foreground flex items-center gap-2.5 px-6 py-5 text-sm">
        <IconRobot className="size-4" />
        No agent decision has been recorded for this thread yet.
      </Card>
    )
  }

  const accent = accentClass(decision.decision)
  const headline =
    (decision.decision ? DECISION_HEADLINE[decision.decision] : null) ??
    decision.decision ??
    "No action"
  const failed = decision.status === "failed"
  // Only "sent"/"approved" are a finished, good outcome (green). Everything else
  // (waiting, needs-a-person, rejected) is an in-between state, shown neutrally.
  const done = decision.status === "sent" || decision.status === "approved"

  const meta: Array<[string, string]> = []
  if (decision.refundRequestCount != null)
    meta.push(["Refund request #", String(decision.refundRequestCount)])
  meta.push(["Decided", formatDateTime(decision.createdAt)])
  if (decision.approvedBy) meta.push(["Approved by", decision.approvedBy])

  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="text-muted-foreground font-heading flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-wider uppercase">
          <IconRobot className="text-foreground size-3.5" />
          Agent decision
          <span className="bg-border h-3 w-px" />
          <span>classified as {classificationLabel(decision.classification)}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-muted-foreground text-sm">
              The agent chose to
            </span>
            <span className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
              <span className={cn("size-2.5 rounded-[3px]", accent)} />
              {headline}
            </span>
            <span className="text-muted-foreground text-sm">
              in response to a{" "}
              <span className="text-foreground font-medium">
                {classificationLabel(decision.classification)}
              </span>
              .
            </span>
          </div>

          {failed ? (
            <span className="border-destructive text-destructive bg-destructive/10 inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold">
              <IconAlertTriangle className="size-4" />
              {humanizeDecisionStatus(decision.status)}
            </span>
          ) : done ? (
            <span className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              <IconCircleCheck className="size-4" />
              {humanizeDecisionStatus(decision.status)}
            </span>
          ) : (
            <span className="text-muted-foreground bg-muted inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold">
              <IconClock className="size-4" />
              {humanizeDecisionStatus(decision.status)}
            </span>
          )}
        </div>

        {decision.llmReasoning ? (
          <p className="text-foreground max-w-[68ch] text-[15px] leading-relaxed text-pretty">
            <span className="text-muted-foreground italic">
              “{decision.llmReasoning}”
            </span>
          </p>
        ) : null}

        {meta.length > 0 ? (
          <dl className="border-border flex flex-wrap gap-x-7 gap-y-3 border-t pt-4">
            {meta.map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="text-muted-foreground text-[11px] tracking-wide uppercase">
                  {label}
                </dt>
                <dd className="font-heading text-sm font-medium tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </Card>
  )
}

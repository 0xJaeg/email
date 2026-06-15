import { Badge } from "@workspace/ui/components/badge"

// Semantic colors beyond the base Badge variants. Tuned for at-a-glance triage:
// amber = retention/refund-intent, blue = informational, emerald = resolved/ok,
// destructive = money-out / failure.
const amber =
  "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400"
const blue =
  "border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-400"
const emerald =
  "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
const zinc =
  "border-transparent bg-zinc-500/15 text-zinc-600 dark:text-zinc-400"

export function ClassificationBadge({ value }: { value: string | null }) {
  if (!value) {
    return (
      <Badge variant="outline" className="border-dashed text-muted-foreground">
        unprocessed
      </Badge>
    )
  }
  if (value === "refund_request") return <Badge className={amber}>Refund</Badge>
  if (value === "faq") return <Badge className={blue}>FAQ</Badge>
  if (value === "spam") return <Badge className={zinc}>Spam</Badge>
  return <Badge variant="secondary">Other</Badge>
}

const DECISION_LABEL: Record<string, string> = {
  send_offer_1: "Offer 1",
  send_offer_2: "Offer 2",
  issue_refund: "Refund",
  issue_refund_chargeback: "Refund · chargeback",
  send_faq_reply: "FAQ reply",
  escalate: "Escalate",
  quarantine_spam: "Quarantined",
}

export function DecisionBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  const label = DECISION_LABEL[value] ?? value
  if (value.startsWith("issue_refund"))
    return <Badge variant="destructive">{label}</Badge>
  if (value.startsWith("send_offer")) return <Badge className={amber}>{label}</Badge>
  if (value === "send_faq_reply") return <Badge className={blue}>{label}</Badge>
  if (value === "quarantine_spam") return <Badge className={zinc}>{label}</Badge>
  return <Badge variant="outline">{label}</Badge>
}

// Title-case a raw enum fallback so nothing renders as lowercase snake_case.
function titleCase(value: string): string {
  const spaced = value.replace(/_/g, " ").trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function ThreadStatusBadge({ value }: { value: string }) {
  if (value === "resolved") return <Badge className={emerald}>Resolved</Badge>
  if (value === "escalated")
    return <Badge variant="destructive">Escalated</Badge>
  return <Badge variant="secondary">{titleCase(value)}</Badge>
}

export function AuditStatusBadge({ value }: { value: string }) {
  if (value === "success") return <Badge className={emerald}>Done</Badge>
  if (value === "failure") return <Badge variant="destructive">Failed</Badge>
  if (value === "pending") return <Badge className={amber}>Pending</Badge>
  if (value === "skipped")
    return <Badge variant="secondary">No action needed</Badge>
  return <Badge variant="secondary">{titleCase(value)}</Badge>
}

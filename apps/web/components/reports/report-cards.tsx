import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import {
  IconMail,
  IconClockPause,
  IconUserExclamation,
  IconSparkles,
  IconSend,
  IconCoin,
  type Icon,
} from "@tabler/icons-react"
import type { ReportStats } from "@/lib/reports"

type Tone = "neutral" | "warn" | "alert"

const TONE: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  warn: "text-amber-600 dark:text-amber-400",
  alert: "text-destructive",
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
}: {
  label: string
  value: string
  icon: Icon
  tone?: Tone
  hint?: string
}) {
  return (
    <Card data-slot="card" className="gap-0">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardDescription>{label}</CardDescription>
          <Icon className={cn("size-4", TONE[tone])} />
        </div>
        <CardTitle
          className={cn(
            "mt-1 text-3xl font-semibold tabular-nums",
            tone !== "neutral" && TONE[tone]
          )}
        >
          {value}
        </CardTitle>
        {hint ? (
          <span className="text-muted-foreground mt-1 text-xs">{hint}</span>
        ) : null}
      </CardHeader>
    </Card>
  )
}

export function ReportCards({ stats }: { stats: ReportStats }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-3">
      <StatCard
        label="Emails received"
        value={String(stats.totalEmails)}
        icon={IconMail}
      />
      <StatCard
        label="Waiting for approval"
        value={String(stats.pendingApproval)}
        icon={IconClockPause}
        tone={stats.pendingApproval > 0 ? "warn" : "neutral"}
        hint={stats.pendingApproval > 0 ? "In the approvals queue" : undefined}
      />
      <StatCard
        label="Needs a person"
        value={String(stats.needsHuman)}
        icon={IconUserExclamation}
        tone={stats.needsHuman > 0 ? "alert" : "neutral"}
        hint={stats.needsHuman > 0 ? "Couldn't be handled automatically" : undefined}
      />
      <StatCard
        label="Auto-handled"
        value={`${stats.autoHandledRate}%`}
        icon={IconSparkles}
        hint="Decided without a person"
      />
      <StatCard label="Replies sent" value={String(stats.sent)} icon={IconSend} />
      <StatCard
        label={`Est. AI cost (${stats.costWindowDays}d)`}
        value={`$${stats.estCostUsd.toFixed(2)}`}
        icon={IconCoin}
        hint="From recorded token usage"
      />
    </div>
  )
}

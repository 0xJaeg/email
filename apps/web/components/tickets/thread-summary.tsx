import type { ReactNode } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { ThreadStatusBadge } from "@/components/shared/status-badges"
import {
  IconCalendar,
  IconCircleDot,
  IconGavel,
  IconMailOpened,
  IconMessage2,
  IconShieldCheck,
  IconUser,
} from "@tabler/icons-react"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: ReactNode
  label: string
  children: ReactNode
}) {
  return (
    <div className="border-border flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-b-0">
      <span className="text-muted-foreground flex items-center gap-2.5">
        {icon}
        {label}
      </span>
      <span className="min-w-0 truncate text-right font-medium">{children}</span>
    </div>
  )
}

// Sidebar: the at-a-glance facts of the thread. The verdict lives in the hero.
export function ThreadSummary({
  status,
  sender,
  createdAt,
  emailCount,
  decisionCount,
  approvedBy,
}: {
  status: string
  sender: string
  createdAt: string
  emailCount: number
  decisionCount: number
  approvedBy: string | null
}) {
  const senderName = sender.replace(/\s*<[^>]*>\s*/, "").trim() || sender
  const senderAddr = sender.match(/<([^>]+)>/)?.[1] ?? null

  return (
    <Card className="gap-0 p-0 lg:sticky lg:top-4">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-muted-foreground font-heading text-[11px] font-semibold tracking-wider uppercase">
          Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 py-1">
        <Fact icon={<IconCircleDot className="size-3.5" />} label="Status">
          <ThreadStatusBadge value={status} />
        </Fact>
        <Fact icon={<IconUser className="size-3.5" />} label="Sender">
          {senderName}
        </Fact>
        {senderAddr ? (
          <Fact icon={<IconMailOpened className="size-3.5" />} label="Address">
            <span className="font-heading text-xs">{senderAddr}</span>
          </Fact>
        ) : null}
        <Fact icon={<IconCalendar className="size-3.5" />} label="Opened">
          <span className="font-heading text-xs tabular-nums">
            {formatDate(createdAt)}
          </span>
        </Fact>
        <Fact icon={<IconMessage2 className="size-3.5" />} label="Messages">
          {emailCount}
        </Fact>
        <Fact icon={<IconGavel className="size-3.5" />} label="Decisions">
          {decisionCount}
        </Fact>
        <Fact icon={<IconShieldCheck className="size-3.5" />} label="Approval">
          {approvedBy ? (
            approvedBy
          ) : (
            <span className="text-muted-foreground font-normal">—</span>
          )}
        </Fact>
      </CardContent>
    </Card>
  )
}

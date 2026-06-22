import { ReportCards } from "@/components/reports/report-cards"
import { VolumeChart } from "@/components/reports/volume-chart"
import { HandledChart } from "@/components/reports/handled-chart"
import { getServerSupabase } from "@/lib/supabase/admin"
import { fetchReportStats } from "@/lib/reports"

export const dynamic = "force-dynamic"

export default async function Page() {
  const stats = await fetchReportStats(getServerSupabase())

  return (
    <div className="@container/main flex flex-col gap-4 lg:gap-6">
      {stats.refundLimitReached ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Daily refund cap reached ({stats.refundsToday}/
          {stats.refundDailyLimit}). Further refund approvals are paused until
          tomorrow (UTC) or until the limit is raised in Settings.
        </div>
      ) : null}
      <ReportCards stats={stats} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-6">
        <VolumeChart data={stats.volumeByDay} />
        <HandledChart byDecision={stats.byDecision} />
      </div>
    </div>
  )
}

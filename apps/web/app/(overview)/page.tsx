import Link from "next/link"
import { SectionCards } from "@/components/dashboard/section-cards"
import { TicketsTable } from "@/components/dashboard/tickets-table"
import { getServerSupabase } from "@/lib/supabase/admin"
import { fetchStats, fetchTickets } from "@/lib/tickets"

export const dynamic = "force-dynamic"

export default async function Page() {
  const supabase = getServerSupabase()
  const [tickets, stats] = await Promise.all([
    fetchTickets(supabase),
    fetchStats(supabase),
  ])

  return (
    <div className="@container/main space-y-2 lg:space-y-4">
      <SectionCards initial={stats} />

      <div className="flex items-center justify-between">
        <h2 className="text-muted-foreground text-sm font-medium">
          Recent tickets
        </h2>
        <Link
          href="/tickets"
          className="text-primary text-sm font-medium hover:underline"
        >
          View all
        </Link>
      </div>
      <TicketsTable initial={tickets} />
    </div>
  )
}

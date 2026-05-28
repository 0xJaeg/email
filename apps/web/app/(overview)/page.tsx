import { SectionCards } from "@/components/section-cards"
import { TicketsTable } from "@/components/tickets-table"
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

      <TicketsTable initial={tickets} />
    </div>
  )
}

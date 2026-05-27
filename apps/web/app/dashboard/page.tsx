import { SectionCards } from "@/components/section-cards"
import { TicketsTable } from "@/components/tickets-table"
import { getServerSupabase } from "@/lib/supabase-server"
import { fetchStats, fetchTickets } from "@/lib/tickets"

export const dynamic = "force-dynamic"

export default async function Page() {
  const supabase = getServerSupabase()
  const [tickets, stats] = await Promise.all([
    fetchTickets(supabase),
    fetchStats(supabase),
  ])

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <SectionCards initial={stats} />
          <div className="px-4 lg:px-6">
            <TicketsTable initial={tickets} />
          </div>
        </div>
      </div>
    </div>
  )
}

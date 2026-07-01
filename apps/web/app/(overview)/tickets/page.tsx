import { Suspense } from "react"
import { SearchBar } from "@/components/shared/search-bar"
import { TicketStatusFilter } from "@/components/tickets/ticket-status-filter"
import { TicketsRealtime } from "@/components/tickets/tickets-realtime"
import { TicketsTable } from "@/components/tickets/tickets-table"
import type { TicketState } from "@/lib/tickets"

export const dynamic = "force-dynamic"

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string
    page?: string
    size?: string
    status?: string
  }>
}) {
  const params = await searchParams
  const query = params.query ?? ""
  const page = Number(params.page) || 1
  const size = Number(params.size) || 10
  // Default to the work queue (open); ?status=done|all|quarantined switch the view.
  const state: TicketState =
    params.status === "done" ||
    params.status === "all" ||
    params.status === "quarantined"
      ? params.status
      : "open"

  return (
    <div className="flex flex-col gap-2 md:gap-4">
      <TicketsRealtime />
      <div className="flex items-center justify-between gap-2">
        <Suspense>
          <SearchBar placeholder="Search sender or subject" />
        </Suspense>
        <Suspense>
          <TicketStatusFilter />
        </Suspense>
      </div>
      <Suspense
        key={`${state}-${query}-${page}-${size}`}
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <TicketsTable query={query} page={page} size={size} state={state} />
      </Suspense>
    </div>
  )
}

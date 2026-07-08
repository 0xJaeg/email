import { Suspense } from "react"
import { SearchBar } from "@/components/shared/search-bar"
import { TicketStatusFilter } from "@/components/tickets/ticket-status-filter"
import { TicketsRealtime } from "@/components/tickets/tickets-realtime"
import { TicketsTable } from "@/components/tickets/tickets-table"
import type { TicketState, TicketOutcome } from "@/lib/tickets"

export const dynamic = "force-dynamic"

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string
    page?: string
    size?: string
    status?: string
    outcome?: string
  }>
}) {
  const params = await searchParams
  const query = params.query ?? ""
  const page = Number(params.page) || 1
  const size = Number(params.size) || 10
  // Work-queue view (default open); ?status=done|all|quarantined switch it.
  const state: TicketState =
    params.status === "done" ||
    params.status === "all" ||
    params.status === "quarantined"
      ? params.status
      : "open"
  // Optional lookup/escalation result filter (independent of the view above).
  const outcome: TicketOutcome | undefined =
    params.outcome === "found" ||
    params.outcome === "not_found" ||
    params.outcome === "failed" ||
    params.outcome === "escalated"
      ? params.outcome
      : undefined

  return (
    <div className="flex flex-col gap-2 md:gap-4">
      <TicketsRealtime />
      <div className="flex items-center flex-wrap md:flex-nowrap justify-between gap-2">
        <Suspense>
          <SearchBar placeholder="Search sender or subject" />
        </Suspense>
        <Suspense>
          <TicketStatusFilter />
        </Suspense>
      </div>
      <Suspense
        key={`${state}-${outcome ?? "all"}-${query}-${page}-${size}`}
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <TicketsTable
          query={query}
          page={page}
          size={size}
          state={state}
          outcome={outcome}
        />
      </Suspense>
    </div>
  )
}

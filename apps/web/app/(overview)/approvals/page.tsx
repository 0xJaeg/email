import { Suspense } from "react"
import { SearchBar } from "@/components/search-bar"
import { ApprovalsTable } from "./approvals-table"

export const dynamic = "force-dynamic"

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; page?: string; size?: string }>
}) {
  const params = await searchParams
  const query = params.query ?? ""
  const page = Number(params.page) || 1
  const size = Number(params.size) || 10

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Refund approvals</h1>
        <p className="text-muted-foreground text-sm">
          Refunds always require human approval before any ClickBank refund or
          confirmation reply.
        </p>
      </div>
      <Suspense>
        <SearchBar placeholder="Search sender or subject" />
      </Suspense>
      <Suspense
        key={`${query}-${page}-${size}`}
        fallback={<p className="text-muted-foreground text-sm">Loading…</p>}
      >
        <ApprovalsTable query={query} page={page} size={size} />
      </Suspense>
    </div>
  )
}

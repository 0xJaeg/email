import { Suspense } from "react"
import { SearchBar } from "@/components/search-bar"
import { ActivityTable } from "./activity-table"
import { ActivityRealtime } from "./activity-realtime"

export const dynamic = "force-dynamic"

export default async function ActivityPage({
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
      <Suspense>
        <SearchBar placeholder="Search action or error" />
      </Suspense>
      <Suspense
        key={`${query}-${page}-${size}`}
        fallback={<p className="text-muted-foreground text-sm">Loading…</p>}
      >
        <ActivityTable query={query} page={page} size={size} />
      </Suspense>
      <ActivityRealtime />
    </div>
  )
}

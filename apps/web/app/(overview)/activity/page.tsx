import { Suspense } from "react"
import { SearchBar } from "@/components/shared/search-bar"
import { ActivityTable } from "@/components/activity/activity-table"
import { ActivityRealtime } from "@/components/activity/activity-realtime"

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
    <div className="flex flex-col gap-2 md:gap-4">
      <Suspense>
        <SearchBar placeholder="Search activity" />
      </Suspense>
      <Suspense
        key={`${query}-${page}-${size}`}
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <ActivityTable query={query} page={page} size={size} />
      </Suspense>
      <ActivityRealtime />
    </div>
  )
}

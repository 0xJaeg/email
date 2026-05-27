import { ActivityLog } from "@/components/activity-log"
import { getServerSupabase } from "@/lib/supabase-server"
import { fetchActivity } from "@/lib/tickets"

export const dynamic = "force-dynamic"

export default async function ActivityPage() {
  const activity = await fetchActivity(getServerSupabase())

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
          <h1 className="text-lg font-semibold">Action log</h1>
          <ActivityLog initial={activity} />
        </div>
      </div>
    </div>
  )
}

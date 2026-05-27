import { ActivityLog } from "@/components/activity-log"
import { getServerSupabase } from "@/lib/supabase-server"
import { fetchActivity } from "@/lib/tickets"

export const dynamic = "force-dynamic"

export default async function ActivityPage() {
  const activity = await fetchActivity(getServerSupabase())

  return (
    <div className="space-y-2 lg:space-y-4">
      <ActivityLog initial={activity} />
    </div>
  )
}

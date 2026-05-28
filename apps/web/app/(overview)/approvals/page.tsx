import { getServerSupabase } from "@/lib/supabase/admin"
import { fetchPendingApprovals } from "@/lib/decisions"
import { ApprovalsTable } from "@/components/approvals-table"

export const dynamic = "force-dynamic"

export default async function ApprovalsPage() {
  const supabase = getServerSupabase()
  const rows = await fetchPendingApprovals(supabase)
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Refund approvals</h1>
        <p className="text-muted-foreground text-sm">
          {rows.length} pending — refunds always require human approval before
          any ClickBank refund or confirmation reply.
        </p>
      </div>
      <ApprovalsTable initial={rows} />
    </div>
  )
}

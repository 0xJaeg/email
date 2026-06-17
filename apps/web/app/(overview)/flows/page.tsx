import { redirect } from "next/navigation"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getInboxOptions } from "@/lib/flow-steps"
import { getFlowGraph } from "@/lib/flow-graph"
import { InboxPicker } from "@/components/flow/inbox-picker"
import { FlowView } from "@/components/flow/flow-view"

export const dynamic = "force-dynamic"

export default async function FlowsPage({
  searchParams,
}: {
  searchParams: Promise<{ inbox?: string }>
}) {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()

  // Admin-only page.
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (caller?.role !== "admin") redirect("/")

  const { inbox } = await searchParams
  const inboxId = inbox ?? null
  const [inboxes, graph] = await Promise.all([
    getInboxOptions(),
    getFlowGraph(inboxId),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <InboxPicker inboxes={inboxes} />
        <p className="text-sm text-muted-foreground">
          The decision tree the agent walks for this inbox — each card is a
          step, and the labelled branch beneath it is the outcome that routes to
          the next step. This is exactly what the worker runs.
        </p>
      </div>
      <FlowView nodes={graph.nodes} edges={graph.edges} />
    </div>
  )
}

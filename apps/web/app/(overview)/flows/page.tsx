import { redirect } from "next/navigation"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getInboxOptions, getFlowSteps } from "@/lib/flow-steps"
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
  const [inboxes, steps] = await Promise.all([
    getInboxOptions(),
    getFlowSteps(inboxId),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <InboxPicker inboxes={inboxes} />
        <p className="text-muted-foreground text-sm">
          The exact sequence the agent runs on a ticket for this inbox, top to
          bottom. Use the pencil on a step to override its AI prompt; an empty
          override falls back to the shared prompt at /prompts.
        </p>
      </div>
      <FlowView steps={steps} />
    </div>
  )
}

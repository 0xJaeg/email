import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import { PromptsTable } from "@/components/prompts/prompts-table"

export const dynamic = "force-dynamic"

export default async function PromptsPage() {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()

  // Admin-only page. updatePrompt re-checks this independently.
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (caller?.role !== "admin") redirect("/")

  return (
    <div className="flex flex-col gap-2 md:gap-4">
      <div>
        <h1 className="text-lg font-semibold">Prompts &amp; policies</h1>
        <p className="text-muted-foreground text-sm">
          The instructions the agent uses to classify emails and write replies.
          Edits apply on the next email — no restart.
        </p>
      </div>
      <Suspense
        fallback={<p className="text-muted-foreground text-sm">Loading…</p>}
      >
        <PromptsTable />
      </Suspense>
    </div>
  )
}

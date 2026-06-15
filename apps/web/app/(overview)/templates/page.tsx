import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import { AddTemplateButton } from "@/components/templates/add-template-button"
import { TemplatesTable } from "@/components/templates/templates-table"

export const dynamic = "force-dynamic"

export default async function TemplatesPage() {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()

  // Admin-only page. The template mutations re-check this independently.
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (caller?.role !== "admin") redirect("/")

  return (
    <div className="flex flex-col gap-2 md:gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Templates</h1>
          <p className="text-muted-foreground text-sm">
            Reusable response snippets the agent can draw on when drafting
            replies.
          </p>
        </div>
        <AddTemplateButton />
      </div>

      <Suspense
        fallback={<p className="text-muted-foreground text-sm">Loading…</p>}
      >
        <TemplatesTable />
      </Suspense>
    </div>
  )
}

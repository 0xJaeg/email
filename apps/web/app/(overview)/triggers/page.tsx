import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getProductOptions } from "@/lib/inboxes"
import { AddTriggerButton } from "@/components/triggers/add-trigger-button"
import { TriggersTable } from "@/components/triggers/triggers-table"

export const dynamic = "force-dynamic"

export default async function TriggersPage() {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()

  // Admin-only page. The trigger mutations re-check this independently.
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (caller?.role !== "admin") redirect("/")

  const products = await getProductOptions()

  return (
    <div className="flex flex-col gap-2 md:gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Action triggers</h1>
          <p className="text-muted-foreground text-sm">
            Per-product rules for when the agent takes an action — currently the
            refund threshold. Edits apply on the next email.
          </p>
        </div>
        <AddTriggerButton products={products} />
      </div>

      <Suspense
        fallback={<p className="text-muted-foreground text-sm">Loading…</p>}
      >
        <TriggersTable products={products} />
      </Suspense>
    </div>
  )
}

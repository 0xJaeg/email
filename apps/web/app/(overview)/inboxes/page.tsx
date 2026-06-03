import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getProductOptions } from "@/lib/inboxes"
import { SearchBar } from "@/components/shared/search-bar"
import { AddInboxButton } from "@/components/inboxes/add-inbox-button"
import { InboxesTable } from "@/components/inboxes/inboxes-table"

export const dynamic = "force-dynamic"

export default async function InboxesPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; page?: string; size?: string }>
}) {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()

  // Admin-only page. The inbox mutations re-check this independently.
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (caller?.role !== "admin") redirect("/")

  const products = await getProductOptions()
  const params = await searchParams
  const query = params.query ?? ""
  const page = Number(params.page) || 1
  const size = Number(params.size) || 10

  return (
    <div className="flex flex-col gap-2 md:gap-4">
      <div className="flex items-center justify-between gap-2">
        <Suspense>
          <SearchBar placeholder="Search inbox or address" />
        </Suspense>
        <AddInboxButton products={products} />
      </div>

      <Suspense
        key={`${query}-${page}-${size}`}
        fallback={<p className="text-muted-foreground text-sm">Loading…</p>}
      >
        <InboxesTable query={query} page={page} size={size} products={products} />
      </Suspense>
    </div>
  )
}

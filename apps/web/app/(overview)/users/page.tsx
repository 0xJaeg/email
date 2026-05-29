import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import { SearchBar } from "@/components/search-bar"
import { AddUserButton } from "./add-user-button"
import { UsersTable } from "./users-table"

export const dynamic = "force-dynamic"

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; page?: string; size?: string }>
}) {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()

  // Admin-only page. The user mutations re-check this independently.
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (caller?.role !== "admin") redirect("/")

  const params = await searchParams
  const query = params.query ?? ""
  const page = Number(params.page) || 1
  const size = Number(params.size) || 10

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-muted-foreground text-sm">
          Create and manage dashboard accounts. Admins can manage users;
          operators have dashboard access only.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Suspense>
          <SearchBar placeholder="Search email or name" />
        </Suspense>
        <AddUserButton />
      </div>

      <Suspense
        key={`${query}-${page}-${size}`}
        fallback={<p className="text-muted-foreground text-sm">Loading…</p>}
      >
        <UsersTable query={query} page={page} size={size} />
      </Suspense>
    </div>
  )
}

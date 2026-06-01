import "server-only"
import { getServerSupabase } from "@/lib/supabase/admin"
import { sanitizeSearch } from "@/lib/search"

export type UserRow = {
  id: string
  email: string
  name: string | null
  role: string
  created_at: string
}

// Uses the secret-key client (bypasses RLS) — the dashboard's doorman model.
// profiles RLS is read-own-only, so listing all users must go through it.
export async function getUsers(
  query: string,
  page: number,
  size: number
): Promise<{ data: UserRow[]; count: number }> {
  const supabase = getServerSupabase()

  let q = supabase
    .from("profiles")
    .select("id, email, name, role, created_at", { count: "exact" })
    .order("created_at", { ascending: false })

  const esc = sanitizeSearch(query)
  if (esc) {
    q = q.or(`email.ilike.%${esc}%,name.ilike.%${esc}%`)
  }

  const { data, error, count } = await q.range(
    (page - 1) * size,
    page * size - 1
  )
  if (error) throw error
  return { data: data ?? [], count: count ?? 0 }
}

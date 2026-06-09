import "server-only"
import { getServerSupabase } from "@/lib/supabase/admin"
import { sanitizeSearch } from "@/lib/search"

export type ProductRow = {
  id: string
  name: string
  slug: string
  platform: string
  adapter_key: string | null
  is_active: boolean
  created_at: string
}

export async function getProducts(
  query: string,
  page: number,
  size: number
): Promise<{ data: ProductRow[]; count: number }> {
  const supabase = getServerSupabase()

  let q = supabase
    .from("products")
    .select("id, name, slug, platform, adapter_key, is_active, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })

  const esc = sanitizeSearch(query)
  if (esc) q = q.or(`name.ilike.%${esc}%,slug.ilike.%${esc}%`)

  const { data, error, count } = await q.range(
    (page - 1) * size,
    page * size - 1
  )
  if (error) throw error
  return { data: data ?? [], count: count ?? 0 }
}

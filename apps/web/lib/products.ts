import "server-only"
import { getServerSupabase } from "@/lib/supabase/admin"
import { sanitizeSearch } from "@/lib/search"

export type SupportConfig = {
  platform?: string
  login_url?: string
  reset_url?: string
  dashboard_url?: string
  notes?: string
  /** Provider product key for multi-product access-lookup adapters (e.g.
   * profitdashboard): a customer must hold THIS key to count as a member. */
  access_product_key?: string
}

export type ProductRow = {
  id: string
  name: string
  slug: string
  platform: string
  adapter_key: string | null
  support_config: SupportConfig
  refund_threshold: number | null
  is_active: boolean
  created_at: string
}

const PRODUCT_COLS =
  "id, name, slug, platform, adapter_key, support_config, refund_threshold, is_active, created_at"

export async function getProduct(id: string): Promise<ProductRow | null> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLS)
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    ...data,
    support_config: (data.support_config ?? {}) as SupportConfig,
  }
}

export async function getProducts(
  query: string,
  page: number,
  size: number
): Promise<{ data: ProductRow[]; count: number }> {
  const supabase = getServerSupabase()

  let q = supabase
    .from("products")
    .select(
      "id, name, slug, platform, adapter_key, support_config, refund_threshold, is_active, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })

  const esc = sanitizeSearch(query)
  if (esc) q = q.or(`name.ilike.%${esc}%,slug.ilike.%${esc}%`)

  const { data, error, count } = await q.range(
    (page - 1) * size,
    page * size - 1
  )
  if (error) throw error
  return {
    data: (data ?? []).map((r) => ({
      ...r,
      support_config: (r.support_config ?? {}) as SupportConfig,
    })),
    count: count ?? 0,
  }
}

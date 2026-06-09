import "server-only"
import { getServerSupabase } from "@/lib/supabase/admin"
import { sanitizeSearch } from "@/lib/search"

export type InboxRow = {
  id: string
  product_id: string
  agent_mail_inbox_id: string
  address: string | null
  is_active: boolean
  created_at: string
}

export type ProductOption = { id: string; name: string }

export async function getInboxes(
  query: string,
  page: number,
  size: number
): Promise<{ data: InboxRow[]; count: number }> {
  const supabase = getServerSupabase()

  let q = supabase
    .from("inboxes")
    .select("id, product_id, agent_mail_inbox_id, address, is_active, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })

  const esc = sanitizeSearch(query)
  if (esc)
    q = q.or(`agent_mail_inbox_id.ilike.%${esc}%,address.ilike.%${esc}%`)

  const { data, error, count } = await q.range(
    (page - 1) * size,
    page * size - 1
  )
  if (error) throw error
  return { data: data ?? [], count: count ?? 0 }
}

export async function getProductOptions(): Promise<ProductOption[]> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("products")
    .select("id, name")
    .order("name")
  if (error) throw error
  return data ?? []
}

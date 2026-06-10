import "server-only"
import { getServerSupabase } from "@/lib/supabase/admin"

export type TriggerRow = {
  id: string
  product_id: string | null
  name: string
  action: string
  after_n_requests: number | null
  is_active: boolean
  updated_at: string
}

export async function getTriggers(): Promise<TriggerRow[]> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("action_triggers")
    .select("id, product_id, name, action, condition, is_active, updated_at")
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []).map((t) => ({
    id: t.id,
    product_id: t.product_id,
    name: t.name,
    action: t.action,
    after_n_requests:
      (t.condition as { after_n_requests?: number } | null)?.after_n_requests ??
      null,
    is_active: t.is_active,
    updated_at: t.updated_at,
  }))
}

import "server-only"
import { getServerSupabase } from "@/lib/supabase/admin"

export type CredentialRow = {
  id: string
  product_id: string
  platform: string
  scope: string
  platform_order: number
  label: string
  last4: string | null
  updated_at: string
}

const CRED_COLS =
  "id, product_id, platform, scope, platform_order, label, last4, updated_at"

// The keys for one product (shown on the product page). Deliberately never
// selects `ciphertext` — the secret value never leaves the server; the dashboard
// only ever shows the label + last4.
export async function getCredentialsForProduct(
  productId: string
): Promise<CredentialRow[]> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("integration_credentials")
    .select(CRED_COLS)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return data ?? []
}

import "server-only"
import { getServerSupabase } from "@/lib/supabase/admin"

export type CredentialRow = {
  id: string
  product_id: string
  platform: string
  label: string
  last4: string | null
  updated_at: string
}

// Deliberately never selects `ciphertext` — the secret value never leaves the
// server, and the dashboard only ever shows the label + last4.
export async function getCredentials(): Promise<CredentialRow[]> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("integration_credentials")
    .select("id, product_id, platform, label, last4, updated_at")
    .order("created_at", { ascending: false })
  if (error) throw error
  return data ?? []
}

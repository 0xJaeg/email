import "server-only"
import { getServerSupabase } from "@/lib/supabase/admin"

export type PromptRow = {
  id: string
  kind: string
  content: string
  version: number
  is_active: boolean
  updated_by: string | null
  updated_at: string
}

// Uses the secret-key client (bypasses RLS) — the dashboard's doorman model.
export async function getPrompts(): Promise<PromptRow[]> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("prompt_configs")
    .select("id, kind, content, version, is_active, updated_by, updated_at")
    .order("kind")
  if (error) throw error
  return data ?? []
}

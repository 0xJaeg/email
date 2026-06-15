import "server-only"
import { getServerSupabase } from "@/lib/supabase/admin"

export type TemplateRow = {
  id: string
  name: string
  title: string
  content: string
  is_active: boolean
  updated_at: string
}

const TEMPLATE_COLS = "id, name, title, content, is_active, updated_at"

export async function getTemplates(): Promise<TemplateRow[]> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("prompt_templates")
    .select(TEMPLATE_COLS)
    .order("name", { ascending: true })
  if (error) throw error
  return data ?? []
}

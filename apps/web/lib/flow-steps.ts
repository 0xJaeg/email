import "server-only"
import { getServerSupabase } from "@/lib/supabase/admin"

export type InboxOption = {
  id: string
  agent_mail_inbox_id: string
}

export async function getInboxOptions(): Promise<InboxOption[]> {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from("inboxes")
    .select("id, agent_mail_inbox_id")
    .order("created_at")
  return data ?? []
}

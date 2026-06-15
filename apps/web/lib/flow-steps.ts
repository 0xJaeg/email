import "server-only"
import { getServerSupabase } from "@/lib/supabase/admin"

// Steps whose ai_prompt the worker actually consumes (classify + draft run an
// editable LLM prompt; enrich = adapter lookup, decide = the refund rule-tree).
// Only these get an edit affordance on /flows.
export const PROMPT_DRIVEN_STEPS: readonly string[] = ["classify", "draft"]

export type FlowStepRow = {
  id: string
  step_key: string
  position: number
  title: string
  description: string | null
  ai_prompt: string | null
  is_active: boolean
}

export type InboxOption = {
  id: string
  address: string | null
  agent_mail_inbox_id: string
}

export async function getInboxOptions(): Promise<InboxOption[]> {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from("inboxes")
    .select("id, address, agent_mail_inbox_id")
    .order("created_at")
  return data ?? []
}

// The flow for an inbox, ordered. Falls back to the global default flow
// (inbox_id is null) when the inbox has none of its own — mirrors the worker's
// loadFlow(), so the page shows exactly what the worker runs.
export async function getFlowSteps(
  inboxId: string | null
): Promise<FlowStepRow[]> {
  const supabase = getServerSupabase()
  const sel = "id, step_key, position, title, description, ai_prompt, is_active"
  if (inboxId) {
    const { data } = await supabase
      .from("flow_steps")
      .select(sel)
      .eq("inbox_id", inboxId)
      .order("position")
    if (data && data.length) return data as FlowStepRow[]
  }
  const { data } = await supabase
    .from("flow_steps")
    .select(sel)
    .is("inbox_id", null)
    .order("position")
  return (data ?? []) as FlowStepRow[]
}

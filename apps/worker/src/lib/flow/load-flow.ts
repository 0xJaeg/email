import type { ServerClient } from "@workspace/db/client"
import type { FlowStepConfig } from "./types.js"

// Load the active flow for an inbox, ordered by position. Falls back to the
// global default flow (inbox_id is null) when the inbox has no flow of its own
// (or when no inbox is given — un-routed / legacy threads).
export async function loadFlow(
  supabase: ServerClient,
  inboxId: string | null
): Promise<FlowStepConfig[]> {
  const select = "step_key, position, ai_prompt, condition"
  if (inboxId) {
    const { data } = await supabase
      .from("flow_steps")
      .select(select)
      .eq("inbox_id", inboxId)
      .eq("is_active", true)
      .order("position")
    if (data && data.length) return data as unknown as FlowStepConfig[]
  }
  const { data } = await supabase
    .from("flow_steps")
    .select(select)
    .is("inbox_id", null)
    .eq("is_active", true)
    .order("position")
  return (data ?? []) as unknown as FlowStepConfig[]
}

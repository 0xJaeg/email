import "server-only"
import { getServerSupabase } from "@/lib/supabase/admin"

// One node of the decision tree the worker walks (flow_nodes).
export type FlowNodeRow = {
  id: string
  node_key: string
  node_type: string
  title: string
  description: string | null
  ai_prompt: string | null
  is_active: boolean
  is_start: boolean
}

// One branch: from a node's outcome to the next node (flow_edges).
export type FlowEdgeRow = {
  from_node_id: string
  to_node_id: string
  outcome: string
  position: number
}

export type FlowGraphData = { nodes: FlowNodeRow[]; edges: FlowEdgeRow[] }

// Node types whose ai_prompt the worker consumes (an editable LLM prompt) — the
// only ones that get an edit affordance on /flows.
export const PROMPT_DRIVEN_NODES: readonly string[] = [
  "spam_filter",
  "classify",
  "send_reply",
]

const NODE_SEL =
  "id, node_key, node_type, title, description, ai_prompt, is_active, is_start"

// The node tree for an inbox. Falls back to the global default tree (inbox_id is
// null) when the inbox has none of its own — mirrors the worker's loadGraph(),
// so the page shows exactly what the worker runs.
export async function getFlowGraph(
  inboxId: string | null
): Promise<FlowGraphData> {
  const supabase = getServerSupabase()

  let nodes: FlowNodeRow[] = []
  if (inboxId) {
    const { data } = await supabase
      .from("flow_nodes")
      .select(NODE_SEL)
      .eq("inbox_id", inboxId)
      .eq("is_active", true)
    if (data && data.length) nodes = data as FlowNodeRow[]
  }
  if (!nodes.length) {
    const { data } = await supabase
      .from("flow_nodes")
      .select(NODE_SEL)
      .is("inbox_id", null)
      .eq("is_active", true)
    nodes = (data ?? []) as FlowNodeRow[]
  }
  if (!nodes.length) return { nodes: [], edges: [] }

  const { data: edges } = await supabase
    .from("flow_edges")
    .select("from_node_id, to_node_id, outcome, position")
    .in(
      "from_node_id",
      nodes.map((n) => n.id)
    )
    .order("position")
  return { nodes, edges: (edges ?? []) as FlowEdgeRow[] }
}

import "server-only"
import { getServerSupabase } from "@/lib/supabase/admin"
import type {
  FlowNodeRow,
  FlowEdgeRow,
  FlowGraphData,
} from "./flow-graph-types"

// The row types + PROMPT_DRIVEN_NODES live in ./flow-graph-types (client-safe);
// re-export them here so server consumers can keep importing from one place.
export * from "./flow-graph-types"

const NODE_SEL =
  "id, node_key, node_type, title, description, ai_prompt, model, config, is_active, is_start"

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

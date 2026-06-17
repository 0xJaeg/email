import type { ServerClient } from "@workspace/db/client"
import type { FlowGraph, FlowNode } from "./types.js"

const NODE_COLS = "id, node_key, node_type, ai_prompt, model, config, is_start"

// Load the active node tree for an inbox, falling back to the global default
// (inbox_id is null) — same resolution as the old loadFlow.
export async function loadGraph(
  supabase: ServerClient,
  inboxId: string | null
): Promise<FlowGraph> {
  const nodes = await loadNodes(supabase, inboxId)
  if (!nodes.length)
    return { startId: null, nodes: new Map(), edges: new Map() }

  const { data: edgeRows } = await supabase
    .from("flow_edges")
    .select("from_node_id, to_node_id, outcome, position")
    .in(
      "from_node_id",
      nodes.map((n) => n.id)
    )
    .order("position")

  const edges = new Map<string, Map<string, string>>()
  for (const e of edgeRows ?? []) {
    if (!edges.has(e.from_node_id)) edges.set(e.from_node_id, new Map())
    edges.get(e.from_node_id)!.set(e.outcome, e.to_node_id)
  }
  const start = nodes.find((n) => n.is_start)
  return {
    startId: start?.id ?? null,
    nodes: new Map(nodes.map((n) => [n.id, n])),
    edges,
  }
}

async function loadNodes(
  supabase: ServerClient,
  inboxId: string | null
): Promise<(FlowNode & { is_start: boolean })[]> {
  if (inboxId) {
    const { data } = await supabase
      .from("flow_nodes")
      .select(NODE_COLS)
      .eq("inbox_id", inboxId)
      .eq("is_active", true)
    if (data && data.length)
      return data as unknown as (FlowNode & { is_start: boolean })[]
  }
  const { data } = await supabase
    .from("flow_nodes")
    .select(NODE_COLS)
    .is("inbox_id", null)
    .eq("is_active", true)
  return (data ?? []) as unknown as (FlowNode & { is_start: boolean })[]
}

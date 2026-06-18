// Client-safe flow-graph types + constants. The actual DB query lives in
// flow-graph.ts ("server-only"); these are split out so client components (the
// /flows canvas + node sheet) can import them without pulling "server-only"
// into the browser bundle.

// One node of the decision tree the worker walks (flow_nodes).
export type FlowNodeRow = {
  id: string
  node_key: string
  node_type: string
  title: string
  description: string | null
  ai_prompt: string | null
  model: string | null
  config: Record<string, unknown>
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
// only ones that get an editable prompt on /flows.
export const PROMPT_DRIVEN_NODES: readonly string[] = [
  "spam_filter",
  "classify",
  "send_reply",
]

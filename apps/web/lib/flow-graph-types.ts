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
// only ones that get an editable prompt on /flows. reply_branch feeds its prompt
// to the branch-picking model; refund_draft feeds its prompt to the reply draft.
export const PROMPT_DRIVEN_NODES: readonly string[] = [
  "spam_filter",
  "classify",
  "send_reply",
  "reply_branch",
  "refund_draft",
]

// --- Canvas view filtering (pure; shared by the /flows canvas + its tests) ---

// Selector view modes for the classification dropdown.
export const VIEW_TRUNK = "__trunk__" // default: only the lead-up to (and incl.) classify
export const VIEW_ALL = "__all__" // the whole tree

// Offer/help reply nodes declare the node they resume at when the customer
// replies (config.awaits_reply_at). The worker resumes there via the thread
// cursor, so it is NOT a flow_edge — surface it as a synthetic "on reply" edge
// so the canvas draws the link and a branch view can reach the reply-handling
// half of the tree (accept/decline → refund / done).
export function resumeEdges(nodes: FlowNodeRow[]): FlowEdgeRow[] {
  const byKey = new Map(nodes.map((n) => [n.node_key, n]))
  const out: FlowEdgeRow[] = []
  for (const n of nodes) {
    const targetKey = n.config.awaits_reply_at as string | undefined
    if (!targetKey) continue
    const target = byKey.get(targetKey)
    if (!target) continue
    out.push({
      from_node_id: n.id,
      to_node_id: target.id,
      outcome: "on reply",
      position: 99,
    })
  }
  return out
}

// Restrict the rendered graph to one classification's branch (the all-at-once
// tree is too busy). TRUNK shows just spam-filter → classify; a classification
// key shows the trunk + everything reachable from that branch (following edges
// AND the "on reply" resume links); ALL shows the full tree. Pure view filter —
// node editing still acts on the full graph.
export function viewSubgraph(
  nodes: FlowNodeRow[],
  edges: FlowEdgeRow[],
  view: string
): { nodes: FlowNodeRow[]; edges: FlowEdgeRow[] } {
  if (view === VIEW_ALL) return { nodes, edges }

  const out = new Map<string, FlowEdgeRow[]>()
  for (const e of edges) {
    const list = out.get(e.from_node_id)
    if (list) list.push(e)
    else out.set(e.from_node_id, [e])
  }

  const start = nodes.find((n) => n.is_start) ?? nodes[0]
  const classify = nodes.find((n) => n.node_type === "classify")
  const keep = new Set<string>()

  // Trunk: start … up to and including classify (don't expand classify's branches).
  if (start) {
    keep.add(start.id)
    const queue = [start.id]
    while (queue.length) {
      const id = queue.shift()!
      if (classify && id === classify.id) continue
      for (const e of out.get(id) ?? []) {
        if (!keep.has(e.to_node_id)) {
          keep.add(e.to_node_id)
          queue.push(e.to_node_id)
        }
      }
    }
  }
  if (classify) keep.add(classify.id)

  // Selected branch: everything reachable from classify's matching outcome edge.
  if (view !== VIEW_TRUNK && classify) {
    const branch = edges.find(
      (e) => e.from_node_id === classify.id && e.outcome === view
    )
    if (branch) {
      keep.add(branch.to_node_id)
      const queue = [branch.to_node_id]
      while (queue.length) {
        const id = queue.shift()!
        // A reply's new_topic loops back to classify — keep it visible but do
        // NOT re-expand all of classify's branches (that pulls in everything).
        if (classify && id === classify.id) continue
        for (const e of out.get(id) ?? []) {
          if (!keep.has(e.to_node_id)) {
            keep.add(e.to_node_id)
            queue.push(e.to_node_id)
          }
        }
      }
    }
  }

  return {
    nodes: nodes.filter((n) => keep.has(n.id)),
    edges: edges.filter(
      (e) => keep.has(e.from_node_id) && keep.has(e.to_node_id)
    ),
  }
}

import type {
  NodeType,
  StepContext,
  FlowGraph,
  FlowRunStep,
} from "./types.js"

// Walk the node graph from the start node. Each node returns an `outcome`; we
// follow the edge (from_node, outcome), falling back to a `default` edge. `halt`
// stops immediately (e.g. spam). maxHops guards against edge cycles. Every node
// visited is appended to ctx.path (in order) so the caller can persist the exact
// executed path for the per-ticket trace.
//
// opts.startNodeKey resumes the walk at a specific node (by node_key) instead of
// the top — used when a customer replies to a prior offer and we jump straight
// to the on-reply decision node. An unknown key falls back to the start node so
// a reply is never dropped.
export async function runGraph(
  graph: FlowGraph,
  registry: Record<string, NodeType>,
  ctx: StepContext,
  opts?: { startNodeKey?: string }
): Promise<StepContext> {
  let currentId = resolveStartId(graph, opts?.startNodeKey)
  const maxHops = graph.nodes.size + 1
  let hops = 0
  const path: FlowRunStep[] = []
  while (currentId && hops < maxHops) {
    hops++
    const node = graph.nodes.get(currentId)
    if (!node) break
    const impl = registry[node.node_type]
    if (!impl) {
      console.warn(`[flow] unknown node_type '${node.node_type}' — stopping`)
      break
    }
    const { outcome, halt, ...patch } = await impl.run(ctx, node)
    Object.assign(ctx, patch)
    path.push({
      node_id: node.id,
      node_key: node.node_key,
      node_type: node.node_type,
      outcome: outcome ?? null,
      halted: Boolean(halt),
    })
    if (halt) break
    const out = graph.edges.get(node.id)
    currentId = out?.get(outcome) ?? out?.get("default") ?? null
  }
  if (hops >= maxHops) console.warn(`[flow] maxHops reached — possible cycle`)
  ctx.path = path
  return ctx
}

// Resolve the node id to start the walk from. With no key, start at the graph's
// start node. With a key, find the node with that node_key; if it is missing
// (e.g. the graph was edited after the offer was sent), warn and fall back to
// the start node so the reply is still processed rather than dropped.
function resolveStartId(
  graph: FlowGraph,
  startNodeKey?: string
): string | null {
  if (!startNodeKey) return graph.startId
  for (const n of graph.nodes.values()) {
    if (n.node_key === startNodeKey) return n.id
  }
  console.warn(
    `[flow] resume node_key '${startNodeKey}' not found — starting from the top`
  )
  return graph.startId
}

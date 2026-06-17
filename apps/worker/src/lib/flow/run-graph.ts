import type { NodeType, StepContext, FlowGraph } from "./types.js"

// Walk the node graph from the start node. Each node returns an `outcome`; we
// follow the edge (from_node, outcome), falling back to a `default` edge. `halt`
// stops immediately (e.g. spam). maxHops guards against edge cycles.
export async function runGraph(
  graph: FlowGraph,
  registry: Record<string, NodeType>,
  ctx: StepContext
): Promise<StepContext> {
  let currentId = graph.startId
  const maxHops = graph.nodes.size + 1
  let hops = 0
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
    if (halt) break
    const out = graph.edges.get(node.id)
    currentId = out?.get(outcome) ?? out?.get("default") ?? null
  }
  if (hops >= maxHops) console.warn(`[flow] maxHops reached — possible cycle`)
  return ctx
}

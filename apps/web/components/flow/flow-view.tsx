import { Badge } from "@workspace/ui/components/badge"
import { IconArrowDown } from "@tabler/icons-react"
import type { FlowNodeRow, FlowEdgeRow } from "@/lib/flow-graph"

// Renders the decision tree the worker walks. A linear step stacks top-to-bottom
// with its branch outcome labelled between cards; a node with multiple outcomes
// fans out into labelled branches. This is the exact graph the worker executes.
export function FlowView({
  nodes,
  edges,
}: {
  nodes: FlowNodeRow[]
  edges: FlowEdgeRow[]
}) {
  if (!nodes.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No flow configured for this inbox.
      </p>
    )
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out = new Map<string, FlowEdgeRow[]>()
  for (const e of edges) {
    const list = out.get(e.from_node_id)
    if (list) list.push(e)
    else out.set(e.from_node_id, [e])
  }
  for (const list of out.values()) list.sort((a, b) => a.position - b.position)
  const start = nodes.find((n) => n.is_start) ?? nodes[0]!

  return (
    <NodeTree nodeId={start.id} byId={byId} out={out} visited={new Set()} />
  )
}

function NodeTree({
  nodeId,
  byId,
  out,
  visited,
}: {
  nodeId: string
  byId: Map<string, FlowNodeRow>
  out: Map<string, FlowEdgeRow[]>
  visited: Set<string>
}) {
  const node = byId.get(nodeId)
  if (!node) return null
  if (visited.has(nodeId)) {
    return (
      <p className="ml-1 text-xs text-muted-foreground italic">
        ↑ loops back to {node.title}
      </p>
    )
  }
  const seen = new Set(visited).add(nodeId)
  const edges = out.get(nodeId) ?? []

  return (
    <div className="flex flex-col items-start">
      <NodeCard node={node} />
      {edges.length === 1 ? (
        <>
          <BranchLabel outcome={edges[0]!.outcome} />
          <NodeTree
            nodeId={edges[0]!.to_node_id}
            byId={byId}
            out={out}
            visited={seen}
          />
        </>
      ) : edges.length > 1 ? (
        <div className="mt-2 ml-3 flex flex-col gap-4 border-l border-border pt-1 pl-4">
          {edges.map((e) => (
            <div
              key={`${e.outcome}->${e.to_node_id}`}
              className="flex flex-col"
            >
              <Badge
                variant="secondary"
                className="mb-2 w-fit font-mono text-[10px]"
              >
                {e.outcome}
              </Badge>
              <NodeTree
                nodeId={e.to_node_id}
                byId={byId}
                out={out}
                visited={new Set(seen)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function BranchLabel({ outcome }: { outcome: string }) {
  return (
    <div className="my-1 flex items-center gap-1 pl-1 text-xs text-muted-foreground">
      <IconArrowDown className="size-3.5" />
      <span className="font-mono text-[10px]">{outcome}</span>
    </div>
  )
}

function NodeCard({ node }: { node: FlowNodeRow }) {
  return (
    <div className="w-full max-w-xl rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {node.is_start ? (
            <Badge variant="outline" className="text-[10px]">
              start
            </Badge>
          ) : null}
          <h3 className="text-sm font-semibold">{node.title}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {!node.is_active && <Badge variant="secondary">inactive</Badge>}
          <Badge variant="outline" className="font-mono text-[10px]">
            {node.node_type}
          </Badge>
        </div>
      </div>
      {node.description ? (
        <p className="mt-2 text-sm text-muted-foreground">{node.description}</p>
      ) : null}
      {node.ai_prompt && node.ai_prompt.trim() ? (
        <div className="mt-3">
          <Badge variant="secondary" className="text-[10px]">
            custom prompt
          </Badge>
          <p className="mt-1 line-clamp-2 font-mono text-xs text-muted-foreground">
            {node.ai_prompt}
          </p>
        </div>
      ) : null}
    </div>
  )
}

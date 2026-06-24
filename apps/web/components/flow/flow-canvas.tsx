"use client"

import { useMemo, useState } from "react"
import {
  IconFilter,
  IconTags,
  IconSearch,
  IconCoin,
  IconMail,
  IconGitBranch,
  IconBox,
  IconShoppingCart,
  IconKey,
  IconUserPlus,
} from "@tabler/icons-react"
import {
  N8nWorkflowBlock,
  type WorkflowCanvasNode,
  type WorkflowCanvasConnection,
} from "@/components/ui/n8n-workflow-block-shadcnui"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { NodeDetailSheet } from "./node-detail-sheet"
import type { FlowNodeRow, FlowEdgeRow } from "@/lib/flow-graph-types"

// Layout spacing (px) for the layered TOP-TO-BOTTOM tree: depth flows down,
// siblings at the same depth fan out across. Vertical keeps the long axis
// (the step depth) on the natural scroll direction.
const ROW_GAP = 170 // vertical gap per depth level
const COL_GAP = 280 // horizontal gap between siblings at the same depth
const X0 = 24
const Y0 = 24

// Presentation per node_type: a palette key (see colorClasses in the canvas)
// and a tabler icon. Unknown types fall back to a neutral box.
const NODE_STYLE: Record<
  string,
  { color: string; icon: WorkflowCanvasNode["icon"] }
> = {
  spam_filter: { color: "rose", icon: IconFilter },
  classify: { color: "amber", icon: IconTags },
  order_lookup: { color: "blue", icon: IconSearch },
  purchase_lookup: { color: "blue", icon: IconShoppingCart },
  access_check: { color: "indigo", icon: IconKey },
  add_to_dashboard: { color: "purple", icon: IconUserPlus },
  refund_ladder: { color: "purple", icon: IconCoin },
  send_reply: { color: "emerald", icon: IconMail },
  decide: { color: "indigo", icon: IconGitBranch },
}
const FALLBACK = { color: "slate", icon: IconBox }

// Lay the graph out top-to-bottom: BFS depth from the start node sets the ROW
// (vertical), and nodes discovered at the same depth fan out into columns
// (horizontal). Maps every node to a canvas node + every edge to a connection.
function layoutGraph(nodes: FlowNodeRow[], edges: FlowEdgeRow[]) {
  const out = new Map<string, FlowEdgeRow[]>()
  for (const e of edges) {
    const list = out.get(e.from_node_id)
    if (list) list.push(e)
    else out.set(e.from_node_id, [e])
  }
  for (const list of out.values()) list.sort((a, b) => a.position - b.position)

  const start = nodes.find((n) => n.is_start) ?? nodes[0]
  const depth = new Map<string, number>()
  const order: string[] = []
  if (start) {
    depth.set(start.id, 0)
    order.push(start.id)
    const seen = new Set([start.id])
    const queue = [start.id]
    while (queue.length) {
      const id = queue.shift()!
      const d = depth.get(id) ?? 0
      for (const e of out.get(id) ?? []) {
        depth.set(e.to_node_id, Math.max(depth.get(e.to_node_id) ?? 0, d + 1))
        if (!seen.has(e.to_node_id)) {
          seen.add(e.to_node_id)
          order.push(e.to_node_id)
          queue.push(e.to_node_id)
        }
      }
    }
  }
  // Nodes unreachable from start still get placed (top row, depth 0).
  for (const n of nodes) {
    if (!depth.has(n.id)) {
      depth.set(n.id, 0)
      order.push(n.id)
    }
  }

  const colByDepth = new Map<number, number>()
  const canvasNodes: WorkflowCanvasNode[] = []
  for (const id of order) {
    const node = nodes.find((n) => n.id === id)
    if (!node) continue
    const d = depth.get(id) ?? 0
    const col = colByDepth.get(d) ?? 0
    colByDepth.set(d, col + 1)
    const style = NODE_STYLE[node.node_type] ?? FALLBACK
    const badges: string[] = []
    if (node.is_start) badges.push("start")
    if (!node.is_active) badges.push("inactive")
    canvasNodes.push({
      id: node.id,
      type: node.node_type,
      title: node.title,
      description: node.description,
      icon: style.icon,
      color: style.color,
      position: { x: X0 + col * COL_GAP, y: Y0 + d * ROW_GAP },
      badges: badges.length ? badges : undefined,
      muted: !node.is_active,
    })
  }

  const connections: WorkflowCanvasConnection[] = edges.map((e) => ({
    from: e.from_node_id,
    to: e.to_node_id,
    // "default" is an unconditional next-step; only label real branches.
    label: e.outcome === "default" ? undefined : e.outcome,
  }))

  return { canvasNodes, connections }
}

// Selector view modes for the classification dropdown.
const VIEW_TRUNK = "__trunk__" // default: only the lead-up to (and incl.) classify
const VIEW_ALL = "__all__" // the whole tree

// Restrict the rendered graph to one classification's branch (Ben's ask: the
// all-at-once tree is too busy). TRUNK shows just spam-filter → classify; a
// classification key shows the trunk + everything reachable from that branch;
// ALL shows the full tree. Pure view filter — node editing still acts on the
// full graph.
function viewSubgraph(
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

// The /flows canvas: renders the decision tree the worker walks in an n8n-style
// graph; a ticket-type selector narrows it to one classification's branch, and
// clicking a node opens a wide sheet with its full config + prompt.
export function FlowCanvas({
  nodes,
  edges,
}: {
  nodes: FlowNodeRow[]
  edges: FlowEdgeRow[]
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<string>(VIEW_TRUNK)

  // Classify categories drive the selector options.
  const categories =
    (nodes.find((n) => n.node_type === "classify")?.config.categories as
      | { key: string; label?: string }[]
      | undefined) ?? []

  const { canvasNodes, connections } = useMemo(() => {
    const sub = viewSubgraph(nodes, edges, view)
    return layoutGraph(sub.nodes, sub.edges)
  }, [nodes, edges, view])

  if (!nodes.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No flow configured for this inbox.
      </p>
    )
  }

  // selected/branches/classifyEditor use the FULL graph — editing is unaffected
  // by the view filter.
  const selected = selectedId
    ? (nodes.find((n) => n.id === selectedId) ?? null)
    : null
  const branches = selected
    ? edges
        .filter((e) => e.from_node_id === selected.id)
        .sort((a, b) => a.position - b.position)
        .map((e) => ({
          outcome: e.outcome,
          to: nodes.find((n) => n.id === e.to_node_id)?.title ?? e.to_node_id,
        }))
    : []

  // For a classify node, build the editable category list (config categories
  // joined with the edge each routes through) + the steps they can route to.
  const classifyEditor =
    selected && selected.node_type === "classify"
      ? {
          nodeId: selected.id,
          categories: (
            (selected.config.categories as
              | { key: string; label?: string; description?: string }[]
              | undefined) ?? []
          ).map((c) => ({
            key: c.key,
            label: c.label ?? "",
            description: c.description ?? "",
            targetNodeId:
              edges.find(
                (e) => e.from_node_id === selected.id && e.outcome === c.key
              )?.to_node_id ?? null,
          })),
          targets: nodes.map((n) => ({ id: n.id, title: n.title })),
        }
      : null

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <N8nWorkflowBlock
        toolbar={
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Show steps for ticket type:
            </span>
            <Select value={view} onValueChange={setView}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={VIEW_TRUNK}>
                  Classified ticket only
                </SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label || c.key}
                  </SelectItem>
                ))}
                <SelectItem value={VIEW_ALL}>Show all branches</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        nodes={canvasNodes}
        connections={connections}
        onNodeClick={setSelectedId}
        orientation="vertical"
      />
      <NodeDetailSheet
        node={selected}
        branches={branches}
        classifyEditor={classifyEditor}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}

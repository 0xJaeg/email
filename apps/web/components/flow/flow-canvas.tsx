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
} from "@tabler/icons-react"
import {
  N8nWorkflowBlock,
  type WorkflowCanvasNode,
  type WorkflowCanvasConnection,
} from "@/components/ui/n8n-workflow-block-shadcnui"
import { NodeDetailSheet } from "./node-detail-sheet"
import type { FlowNodeRow, FlowEdgeRow } from "@/lib/flow-graph-types"

// Layout spacing (px) for the layered left-to-right tree.
const COL_W = 300
const ROW_H = 150
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
  refund_ladder: { color: "purple", icon: IconCoin },
  send_reply: { color: "emerald", icon: IconMail },
  decide: { color: "indigo", icon: IconGitBranch },
}
const FALLBACK = { color: "slate", icon: IconBox }

// Lay the graph out as columns by BFS depth from the start node; stack the
// nodes discovered at each depth into rows. Maps every node to a canvas node
// (position + icon/color) and every edge to a connection (named outcome only).
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
  // Nodes unreachable from start still get placed (column 0).
  for (const n of nodes) {
    if (!depth.has(n.id)) {
      depth.set(n.id, 0)
      order.push(n.id)
    }
  }

  const rowByCol = new Map<number, number>()
  const canvasNodes: WorkflowCanvasNode[] = []
  for (const id of order) {
    const node = nodes.find((n) => n.id === id)
    if (!node) continue
    const d = depth.get(id) ?? 0
    const row = rowByCol.get(d) ?? 0
    rowByCol.set(d, row + 1)
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
      position: { x: X0 + d * COL_W, y: Y0 + row * ROW_H },
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

// The /flows canvas: renders the decision tree the worker walks in an n8n-style
// graph; clicking a node opens a wide sheet with its full config + prompt.
export function FlowCanvas({
  nodes,
  edges,
}: {
  nodes: FlowNodeRow[]
  edges: FlowEdgeRow[]
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { canvasNodes, connections } = useMemo(
    () => layoutGraph(nodes, edges),
    [nodes, edges]
  )

  if (!nodes.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No flow configured for this inbox.
      </p>
    )
  }

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

  return (
    <>
      <N8nWorkflowBlock
        nodes={canvasNodes}
        connections={connections}
        onNodeClick={setSelectedId}
      />
      <NodeDetailSheet
        node={selected}
        branches={branches}
        onClose={() => setSelectedId(null)}
      />
    </>
  )
}

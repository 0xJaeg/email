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
import * as dagre from "dagre"
import {
  N8nWorkflowBlock,
  NODE_WIDTH,
  NODE_HEIGHT,
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
import {
  VIEW_TRUNK,
  VIEW_ALL,
  viewSubgraph,
  resumeEdges,
  type FlowNodeRow,
  type FlowEdgeRow,
} from "@/lib/flow-graph-types"

// Layered TOP-TO-BOTTOM layout via dagre: ranks flow down, siblings fan out
// across, and each edge is routed (with waypoints) around intervening nodes so
// shared targets like "Escalate to human" no longer pile overlapping lines and
// labels down a single column. Spacing (px):
const RANK_GAP = 90 // vertical gap between ranks (depth levels)
const NODE_GAP = 70 // horizontal gap between nodes in the same rank
const EDGE_GAP = 30 // gap between parallel edges
const MARGIN = 24 // padding around the laid-out graph

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

// Lay the graph out top-to-bottom with dagre: it assigns ranks (depth → row),
// orders nodes within a rank to minimise edge crossings, and routes each edge
// through waypoints that bend around other nodes. Maps every node to a canvas
// node (top-left position) + every edge to a connection carrying its waypoints
// and label anchor, so the renderer never has to re-derive them.
function layoutGraph(nodes: FlowNodeRow[], edges: FlowEdgeRow[]) {
  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({
    rankdir: "TB",
    nodesep: NODE_GAP,
    edgesep: EDGE_GAP,
    ranksep: RANK_GAP,
    marginx: MARGIN,
    marginy: MARGIN,
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const n of nodes)
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  edges.forEach((e, i) => {
    // "default" is an unconditional next-step; only real branches get a label,
    // and a labelled edge reserves space so dagre keeps the label clear.
    const label = e.outcome === "default" ? undefined : e.outcome
    g.setEdge(
      e.from_node_id,
      e.to_node_id,
      label
        ? { width: label.length * 6 + 14, height: 18, labelpos: "c" }
        : {},
      `e${i}`
    )
  })

  dagre.layout(g)

  const canvasNodes: WorkflowCanvasNode[] = []
  for (const node of nodes) {
    const dn = g.node(node.id)
    if (!dn) continue
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
      // dagre reports node CENTERS; the canvas positions by top-left.
      position: { x: dn.x - NODE_WIDTH / 2, y: dn.y - NODE_HEIGHT / 2 },
      badges: badges.length ? badges : undefined,
      muted: !node.is_active,
    })
  }

  const connections: WorkflowCanvasConnection[] = edges.map((e, i) => {
    const de = g.edge(e.from_node_id, e.to_node_id, `e${i}`)
    const label = e.outcome === "default" ? undefined : e.outcome
    return {
      from: e.from_node_id,
      to: e.to_node_id,
      label,
      points: de?.points,
      labelPos:
        label && de && typeof de.x === "number"
          ? { x: de.x, y: de.y }
          : undefined,
    }
  })

  return { canvasNodes, connections }
}

// View filtering (VIEW_TRUNK/VIEW_ALL, resumeEdges, viewSubgraph) lives in
// flow-graph-types.ts so it can be unit-tested without the client-only canvas deps.

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
    // Include the resume links (config.awaits_reply_at) so a branch view reaches
    // the reply-handling half of the tree, and the canvas draws the connection.
    const sub = viewSubgraph(nodes, [...edges, ...resumeEdges(nodes)], view)
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
        .map((e) => {
          const target = nodes.find((n) => n.id === e.to_node_id)
          return {
            outcome: e.outcome,
            to: target?.title ?? e.to_node_id,
            // One-line summary of where this branch leads, shown under it on the
            // panel so you don't have to open the destination to see what it does.
            toDescription: target?.description ?? null,
          }
        })
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

"use client"

import { motion, type PanInfo } from "framer-motion"
import type React from "react"
import { useRef, useState } from "react"
import { flushSync } from "react-dom"

import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"

// A single node to render on the canvas. Layout (position) + presentation
// (icon/color) are decided by the caller; this component only draws + drags.
export interface WorkflowCanvasNode {
  id: string
  type: string
  title: string
  description?: string | null
  icon: React.ComponentType<{ className?: string }>
  color: string
  position: { x: number; y: number }
  badges?: string[]
  muted?: boolean
}

// A directed connection between two nodes, with an optional branch label
// (the edge outcome, e.g. "not_spam" / "refund").
export interface WorkflowCanvasConnection {
  from: string
  to: string
  label?: string
}

const NODE_WIDTH = 220
const NODE_HEIGHT = 104

const colorClasses: Record<string, string> = {
  rose: "border-rose-400/40 bg-rose-400/10 text-rose-500",
  amber: "border-amber-400/40 bg-amber-400/10 text-amber-500",
  blue: "border-blue-400/40 bg-blue-400/10 text-blue-500",
  purple: "border-purple-400/40 bg-purple-400/10 text-purple-500",
  emerald: "border-emerald-400/40 bg-emerald-400/10 text-emerald-500",
  indigo: "border-indigo-400/40 bg-indigo-400/10 text-indigo-500",
  cyan: "border-cyan-400/40 bg-cyan-400/10 text-cyan-500",
  orange: "border-orange-400/40 bg-orange-400/10 text-orange-500",
  slate: "border-slate-400/40 bg-slate-400/10 text-slate-500",
}

function ConnectionLine({
  from,
  to,
  nodes,
}: {
  from: string
  to: string
  nodes: WorkflowCanvasNode[]
}) {
  const fromNode = nodes.find((n) => n.id === from)
  const toNode = nodes.find((n) => n.id === to)
  if (!fromNode || !toNode) return null

  const startX = fromNode.position.x + NODE_WIDTH
  const startY = fromNode.position.y + NODE_HEIGHT / 2
  const endX = toNode.position.x
  const endY = toNode.position.y + NODE_HEIGHT / 2
  const cp1X = startX + (endX - startX) * 0.5
  const cp2X = endX - (endX - startX) * 0.5
  const path = `M${startX},${startY} C${cp1X},${startY} ${cp2X},${endY} ${endX},${endY}`

  return (
    <path
      d={path}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeDasharray="6,6"
      strokeLinecap="round"
      opacity={0.4}
      className="text-muted-foreground"
    />
  )
}

// A read + interact canvas: nodes are laid out by the caller, draggable to
// reposition within the session (positions are not persisted), and clicking a
// node calls onNodeClick. Connections are drawn as dashed bezier curves with
// their branch outcome labelled at the midpoint.
export function N8nWorkflowBlock({
  nodes: initialNodes,
  connections,
  onNodeClick,
  toolbar,
}: {
  nodes: WorkflowCanvasNode[]
  connections: WorkflowCanvasConnection[]
  onNodeClick?: (id: string) => void
  /** Optional controls rendered at the top, inside the card (e.g. a filter). */
  toolbar?: React.ReactNode
}) {
  const [nodes, setNodes] = useState<WorkflowCanvasNode[]>(initialNodes)
  // Re-sync when the caller changes the node SET (e.g. the flow-view filter or a
  // different inbox). Internal state otherwise sticks at the mount value because
  // we keep local positions for dragging. Keyed by the id list so a drag (which
  // changes only a position, not the id set) doesn't reset the layout.
  const idsKey = initialNodes.map((n) => n.id).join("|")
  const syncedIdsKey = useRef(idsKey)
  if (syncedIdsKey.current !== idsKey) {
    syncedIdsKey.current = idsKey
    setNodes(initialNodes)
  }
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragStartPosition = useRef<{ x: number; y: number } | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)

  const contentWidth =
    Math.max(0, ...nodes.map((n) => n.position.x + NODE_WIDTH)) + 60
  const contentHeight =
    Math.max(0, ...nodes.map((n) => n.position.y + NODE_HEIGHT)) + 60

  const handleDragStart = (nodeId: string) => {
    setDraggingNodeId(nodeId)
    const node = nodes.find((n) => n.id === nodeId)
    if (node) dragStartPosition.current = { ...node.position }
  }

  const handleDrag = (nodeId: string, { offset }: PanInfo) => {
    if (draggingNodeId !== nodeId || !dragStartPosition.current) return
    const x = Math.max(0, dragStartPosition.current.x + offset.x)
    const y = Math.max(0, dragStartPosition.current.y + offset.y)
    flushSync(() => {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, position: { x, y } } : n))
      )
    })
  }

  const handleDragEnd = () => {
    setDraggingNodeId(null)
    dragStartPosition.current = null
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-background/60 p-2">
      {toolbar ? <div className="px-1 pt-1 pb-2">{toolbar}</div> : null}
      <div
        ref={canvasRef}
        className="relative min-h-0 w-full flex-1 overflow-auto rounded-xl border bg-muted/20"
        role="region"
        aria-label="Decision flow canvas"
        tabIndex={0}
      >
        <div
          className="relative"
          style={{ minWidth: contentWidth, minHeight: contentHeight }}
        >
          <svg
            className="pointer-events-none absolute top-0 left-0"
            width={contentWidth}
            height={contentHeight}
            style={{ overflow: "visible" }}
            aria-hidden="true"
          >
            {connections.map((c) => (
              <ConnectionLine
                key={`${c.from}->${c.to}->${c.label ?? ""}`}
                from={c.from}
                to={c.to}
                nodes={nodes}
              />
            ))}
          </svg>

          {/* Branch outcome labels, positioned at each connection's midpoint. */}
          {connections.map((c) => {
            if (!c.label) return null
            const fromNode = nodes.find((n) => n.id === c.from)
            const toNode = nodes.find((n) => n.id === c.to)
            if (!fromNode || !toNode) return null
            const x = (fromNode.position.x + NODE_WIDTH + toNode.position.x) / 2
            const y =
              (fromNode.position.y + toNode.position.y) / 2 + NODE_HEIGHT / 2
            return (
              <div
                key={`label-${c.from}->${c.to}->${c.label}`}
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: x, top: y }}
              >
                <span className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                  {c.label}
                </span>
              </div>
            )
          })}

          {nodes.map((node) => {
            const Icon = node.icon
            const isDragging = draggingNodeId === node.id
            return (
              <motion.div
                key={node.id}
                drag
                dragMomentum={false}
                onDragStart={() => handleDragStart(node.id)}
                onDrag={(_, info) => handleDrag(node.id, info)}
                onDragEnd={handleDragEnd}
                onTap={() => onNodeClick?.(node.id)}
                style={{
                  x: node.position.x,
                  y: node.position.y,
                  width: NODE_WIDTH,
                  transformOrigin: "0 0",
                }}
                className="absolute cursor-pointer"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.15 }}
                whileHover={{ scale: 1.02 }}
                whileDrag={{ scale: 1.04, zIndex: 50, cursor: "grabbing" }}
              >
                <Card
                  className={`relative w-full gap-0 overflow-hidden rounded-xl border bg-card p-3 transition-shadow hover:shadow-md ${
                    colorClasses[node.color] ?? colorClasses.slate
                  } ${isDragging ? "shadow-lg ring-2 ring-primary/50" : ""} ${
                    node.muted ? "opacity-60" : ""
                  }`}
                  role="button"
                  aria-label={`${node.type} node: ${node.title}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                        colorClasses[node.color] ?? colorClasses.slate
                      } bg-background/80`}
                      aria-hidden="true"
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[9px] tracking-wide text-muted-foreground uppercase">
                        {node.type}
                      </span>
                      <h3 className="truncate text-xs font-semibold text-foreground">
                        {node.title}
                      </h3>
                    </div>
                  </div>
                  {node.description ? (
                    <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                      {node.description}
                    </p>
                  ) : null}
                  {node.badges && node.badges.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {node.badges.map((b) => (
                        <Badge
                          key={b}
                          variant="secondary"
                          className="px-1.5 py-0 text-[9px]"
                        >
                          {b}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </Card>
              </motion.div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-2 py-2 text-[10px] tracking-wide text-muted-foreground uppercase">
        <span>
          {nodes.length} {nodes.length === 1 ? "node" : "nodes"} ·{" "}
          {connections.length}{" "}
          {connections.length === 1 ? "branch" : "branches"}
        </span>
        <span>Click a node for details · drag to reposition</span>
      </div>
    </div>
  )
}

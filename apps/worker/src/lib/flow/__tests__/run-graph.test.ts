import { describe, it, expect } from "vitest"
import { runGraph } from "../run-graph.js"
import type { NodeType, StepContext, FlowGraph, FlowNode } from "../types.js"

const node = (id: string, type: string): FlowNode => ({
  id,
  node_key: id,
  node_type: type,
  ai_prompt: null,
  model: null,
  config: {},
})

// Build a FlowGraph from a start id, nodes, and [from, outcome, to] edges.
const graph = (
  startId: string,
  nodes: FlowNode[],
  edgeList: [string, string, string][]
): FlowGraph => {
  const edges = new Map<string, Map<string, string>>()
  for (const [from, outcome, to] of edgeList) {
    if (!edges.has(from)) edges.set(from, new Map())
    edges.get(from)!.set(outcome, to)
  }
  return { startId, nodes: new Map(nodes.map((n) => [n.id, n])), edges }
}

describe("runGraph", () => {
  it("walks from start, following the edge for each node's outcome", async () => {
    const calls: string[] = []
    const reg: Record<string, NodeType> = {
      A: { type: "A", run: async () => { calls.push("A"); return { outcome: "go" } } },
      B: { type: "B", run: async () => { calls.push("B"); return { outcome: "done" } } },
    }
    const g = graph("a", [node("a", "A"), node("b", "B")], [["a", "go", "b"]])
    await runGraph(g, reg, {} as StepContext)
    expect(calls).toEqual(["A", "B"])
  })

  it("falls back to the 'default' edge when no edge matches the outcome", async () => {
    const calls: string[] = []
    const reg: Record<string, NodeType> = {
      A: { type: "A", run: async () => { calls.push("A"); return { outcome: "refund_request" } } },
      B: { type: "B", run: async () => { calls.push("B"); return { outcome: "done" } } },
    }
    const g = graph("a", [node("a", "A"), node("b", "B")], [["a", "default", "b"]])
    await runGraph(g, reg, {} as StepContext)
    expect(calls).toEqual(["A", "B"])
  })

  it("halts when a node returns halt (no edge followed)", async () => {
    const calls: string[] = []
    const reg: Record<string, NodeType> = {
      A: { type: "A", run: async () => { calls.push("A"); return { outcome: "spam", halt: true } } },
      B: { type: "B", run: async () => { calls.push("B"); return { outcome: "done" } } },
    }
    const g = graph("a", [node("a", "A"), node("b", "B")], [["a", "not_spam", "b"]])
    await runGraph(g, reg, {} as StepContext)
    expect(calls).toEqual(["A"])
  })

  it("merges each node's patch into ctx", async () => {
    const reg: Record<string, NodeType> = {
      A: { type: "A", run: async () => ({ outcome: "default", productFacts: "x" }) },
      B: { type: "B", run: async (ctx) => ({ outcome: "done", decisionId: ctx.productFacts ?? "" }) },
    }
    const g = graph("a", [node("a", "A"), node("b", "B")], [["a", "default", "b"]])
    const out = await runGraph(g, reg, {} as StepContext)
    expect(out.decisionId).toBe("x")
  })

  it("ends at a terminal node (no outgoing edge)", async () => {
    const calls: string[] = []
    const reg: Record<string, NodeType> = {
      A: { type: "A", run: async () => { calls.push("A"); return { outcome: "done" } } },
    }
    const g = graph("a", [node("a", "A")], [])
    await runGraph(g, reg, {} as StepContext)
    expect(calls).toEqual(["A"])
  })

  it("stops on an unknown node_type without throwing", async () => {
    const g = graph("a", [node("a", "MISSING")], [])
    await expect(runGraph(g, {}, {} as StepContext)).resolves.toBeDefined()
  })

  it("bounds traversal against cycles (maxHops)", async () => {
    let n = 0
    const reg: Record<string, NodeType> = {
      A: { type: "A", run: async () => { n++; return { outcome: "default" } } },
    }
    const g = graph("a", [node("a", "A"), node("b", "A")], [
      ["a", "default", "b"],
      ["b", "default", "a"],
    ])
    await runGraph(g, reg, {} as StepContext)
    expect(n).toBeLessThanOrEqual(3) // nodes.size + 1
  })
})

describe("seeded default tree (equivalence)", () => {
  // Mirror the migration's seeded nodes/edges.
  const SEED_NODES = ["spam_filter", "classify", "lookup_gate", "enrich", "decide", "draft"]
  const SEED_EDGES: [string, string, string][] = [
    ["spam_filter", "not_spam", "classify"],
    ["classify", "default", "lookup_gate"],
    ["lookup_gate", "default", "enrich"],
    ["enrich", "default", "decide"],
    ["decide", "default", "draft"],
  ]
  const buildGraph = () =>
    graph("spam_filter", SEED_NODES.map((k) => node(k, k)), SEED_EDGES)

  it("non-spam ticket visits all six nodes in pipeline order", async () => {
    const seen: string[] = []
    const reg: Record<string, NodeType> = Object.fromEntries(
      SEED_NODES.map((k) => [
        k,
        {
          type: k,
          run: async () => {
            seen.push(k)
            if (k === "spam_filter") return { outcome: "not_spam" } // pass path
            if (k === "classify") return { outcome: "faq" } // real label routes via 'default'
            if (k === "decide") return { outcome: "send_faq_reply" }
            if (k === "draft") return { outcome: "done" }
            return { outcome: "default" }
          },
        } as NodeType,
      ])
    )
    await runGraph(buildGraph(), reg, {} as StepContext)
    expect(seen).toEqual(["spam_filter", "classify", "lookup_gate", "enrich", "decide", "draft"])
  })

  it("spam ticket halts after spam_filter", async () => {
    const seen: string[] = []
    const reg: Record<string, NodeType> = Object.fromEntries(
      SEED_NODES.map((k) => [
        k,
        {
          type: k,
          run: async () => {
            seen.push(k)
            if (k === "spam_filter") return { outcome: "spam", halt: true }
            return { outcome: "default" }
          },
        } as NodeType,
      ])
    )
    await runGraph(buildGraph(), reg, {} as StepContext)
    expect(seen).toEqual(["spam_filter"])
  })
})

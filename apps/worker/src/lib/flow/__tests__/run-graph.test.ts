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
      A: {
        type: "A",
        run: async () => {
          calls.push("A")
          return { outcome: "go" }
        },
      },
      B: {
        type: "B",
        run: async () => {
          calls.push("B")
          return { outcome: "done" }
        },
      },
    }
    const g = graph("a", [node("a", "A"), node("b", "B")], [["a", "go", "b"]])
    await runGraph(g, reg, {} as StepContext)
    expect(calls).toEqual(["A", "B"])
  })

  it("falls back to the 'default' edge when no edge matches the outcome", async () => {
    const calls: string[] = []
    const reg: Record<string, NodeType> = {
      A: {
        type: "A",
        run: async () => {
          calls.push("A")
          return { outcome: "refund_request" }
        },
      },
      B: {
        type: "B",
        run: async () => {
          calls.push("B")
          return { outcome: "done" }
        },
      },
    }
    const g = graph(
      "a",
      [node("a", "A"), node("b", "B")],
      [["a", "default", "b"]]
    )
    await runGraph(g, reg, {} as StepContext)
    expect(calls).toEqual(["A", "B"])
  })

  it("halts when a node returns halt (no edge followed)", async () => {
    const calls: string[] = []
    const reg: Record<string, NodeType> = {
      A: {
        type: "A",
        run: async () => {
          calls.push("A")
          return { outcome: "spam", halt: true }
        },
      },
      B: {
        type: "B",
        run: async () => {
          calls.push("B")
          return { outcome: "done" }
        },
      },
    }
    const g = graph(
      "a",
      [node("a", "A"), node("b", "B")],
      [["a", "not_spam", "b"]]
    )
    await runGraph(g, reg, {} as StepContext)
    expect(calls).toEqual(["A"])
  })

  it("merges each node's patch into ctx", async () => {
    const reg: Record<string, NodeType> = {
      A: {
        type: "A",
        run: async () => ({ outcome: "default", productFacts: "x" }),
      },
      B: {
        type: "B",
        run: async (ctx) => ({
          outcome: "done",
          decisionId: ctx.productFacts ?? "",
        }),
      },
    }
    const g = graph(
      "a",
      [node("a", "A"), node("b", "B")],
      [["a", "default", "b"]]
    )
    const out = await runGraph(g, reg, {} as StepContext)
    expect(out.decisionId).toBe("x")
  })

  it("ends at a terminal node (no outgoing edge)", async () => {
    const calls: string[] = []
    const reg: Record<string, NodeType> = {
      A: {
        type: "A",
        run: async () => {
          calls.push("A")
          return { outcome: "done" }
        },
      },
    }
    const g = graph("a", [node("a", "A")], [])
    await runGraph(g, reg, {} as StepContext)
    expect(calls).toEqual(["A"])
  })

  it("stops on an unknown node_type without throwing", async () => {
    const g = graph("a", [node("a", "MISSING")], [])
    await expect(runGraph(g, {}, {} as StepContext)).resolves.toBeDefined()
  })

  it("records the executed path (node + outcome + halted) into ctx.path", async () => {
    const reg: Record<string, NodeType> = {
      A: { type: "A", run: async () => ({ outcome: "go" }) },
      B: { type: "B", run: async () => ({ outcome: "spam", halt: true }) },
    }
    const g = graph("a", [node("a", "A"), node("b", "B")], [["a", "go", "b"]])
    const out = await runGraph(g, reg, {} as StepContext)
    expect(out.path).toEqual([
      {
        node_id: "a",
        node_key: "a",
        node_type: "A",
        outcome: "go",
        halted: false,
      },
      {
        node_id: "b",
        node_key: "b",
        node_type: "B",
        outcome: "spam",
        halted: true,
      },
    ])
  })

  it("bounds traversal against cycles (maxHops)", async () => {
    let n = 0
    const reg: Record<string, NodeType> = {
      A: {
        type: "A",
        run: async () => {
          n++
          return { outcome: "default" }
        },
      },
    }
    const g = graph(
      "a",
      [node("a", "A"), node("b", "A")],
      [
        ["a", "default", "b"],
        ["b", "default", "a"],
      ]
    )
    await runGraph(g, reg, {} as StepContext)
    expect(n).toBeLessThanOrEqual(3) // nodes.size + 1
  })
})

describe("seeded default tree (equivalence)", () => {
  // Mirror the migration's seeded nodes/edges.
  const SEED_NODES = [
    "spam_filter",
    "classify",
    "lookup_gate",
    "enrich",
    "decide",
    "draft",
  ]
  const SEED_EDGES: [string, string, string][] = [
    ["spam_filter", "not_spam", "classify"],
    ["classify", "default", "lookup_gate"],
    ["lookup_gate", "default", "enrich"],
    ["enrich", "default", "decide"],
    ["decide", "default", "draft"],
  ]
  const buildGraph = () =>
    graph(
      "spam_filter",
      SEED_NODES.map((k) => node(k, k)),
      SEED_EDGES
    )

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
    expect(seen).toEqual([
      "spam_filter",
      "classify",
      "lookup_gate",
      "enrich",
      "decide",
      "draft",
    ])
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

describe("login_access purchase → access → add-user wiring", () => {
  // Mirrors the migration's login branch. Documents that the graph routes each
  // outcome to the right step (purchase first, then access, then add-user).
  const LOGIN_NODES = [
    "classify",
    "purchase_lookup",
    "access_check",
    "add_to_dashboard",
    "reply_login",
    "reply_no_order",
    "escalate",
  ]
  const LOGIN_EDGES: [string, string, string][] = [
    ["classify", "login_access", "purchase_lookup"],
    ["purchase_lookup", "found", "access_check"],
    ["purchase_lookup", "not_found", "reply_no_order"],
    ["purchase_lookup", "failed", "escalate"],
    ["access_check", "has_access", "reply_login"],
    ["access_check", "no_access", "add_to_dashboard"],
    ["access_check", "failed", "escalate"],
    ["add_to_dashboard", "success", "reply_login"],
    ["add_to_dashboard", "failed", "escalate"],
  ]
  // Walk the login branch with a fixed outcome per node (terminal nodes "done").
  const walk = async (outcomes: Record<string, string>) => {
    const seen: string[] = []
    const reg: Record<string, NodeType> = Object.fromEntries(
      LOGIN_NODES.map((k) => [
        k,
        {
          type: k,
          run: async () => {
            seen.push(k)
            return { outcome: outcomes[k] ?? "done" }
          },
        } as NodeType,
      ])
    )
    const g = graph(
      "classify",
      LOGIN_NODES.map((k) => node(k, k)),
      LOGIN_EDGES
    )
    await runGraph(g, reg, {} as StepContext)
    return seen
  }

  it("purchase found + access active → send login help", async () => {
    expect(
      await walk({
        classify: "login_access",
        purchase_lookup: "found",
        access_check: "has_access",
      })
    ).toEqual(["classify", "purchase_lookup", "access_check", "reply_login"])
  })

  it("purchase found + no access → add to dashboard (stub fails → escalate)", async () => {
    expect(
      await walk({
        classify: "login_access",
        purchase_lookup: "found",
        access_check: "no_access",
        add_to_dashboard: "failed",
      })
    ).toEqual([
      "classify",
      "purchase_lookup",
      "access_check",
      "add_to_dashboard",
      "escalate",
    ])
  })

  it("no purchase → can't-find-order reply", async () => {
    expect(
      await walk({ classify: "login_access", purchase_lookup: "not_found" })
    ).toEqual(["classify", "purchase_lookup", "reply_no_order"])
  })

  it("purchase APIs unavailable → escalate to a human", async () => {
    expect(
      await walk({ classify: "login_access", purchase_lookup: "failed" })
    ).toEqual(["classify", "purchase_lookup", "escalate"])
  })
})

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

describe("runGraph arbitrary start (resume)", () => {
  const reg = (calls: string[]): Record<string, NodeType> => ({
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
        return { outcome: "go" }
      },
    },
    C: {
      type: "C",
      run: async () => {
        calls.push("C")
        return { outcome: "done" }
      },
    },
  })
  const threeNodeGraph = () =>
    graph(
      "a",
      [node("a", "A"), node("b", "B"), node("c", "C")],
      [
        ["a", "go", "b"],
        ["b", "go", "c"],
      ]
    )

  it("starts at opts.startNodeKey and walks forward from there", async () => {
    const calls: string[] = []
    await runGraph(threeNodeGraph(), reg(calls), {} as StepContext, {
      startNodeKey: "b",
    })
    expect(calls).toEqual(["B", "C"])
  })

  it("falls back to the start node when the startNodeKey is unknown", async () => {
    const calls: string[] = []
    await runGraph(threeNodeGraph(), reg(calls), {} as StepContext, {
      startNodeKey: "does_not_exist",
    })
    expect(calls).toEqual(["A", "B", "C"])
  })

  it("records only the resumed nodes in ctx.path", async () => {
    const calls: string[] = []
    const out = await runGraph(threeNodeGraph(), reg(calls), {} as StepContext, {
      startNodeKey: "b",
    })
    expect(out.path?.map((s) => s.node_key)).toEqual(["b", "c"])
  })
})

describe("refund save-the-sale tree wiring", () => {
  // Mirrors the 20260701000003 migration edges. The offer/help replies are
  // terminal (they await a customer reply via the resume cursor); the await_*
  // nodes are resume entry points reached with startNodeKey, not an edge.
  const NODES = [
    "refund_problem_gate",
    "reply_save_no_problem",
    "reply_help_problem",
    "await_save_no_problem_reply",
    "await_help_problem_reply",
    "refund_issue",
    "stop_do_nothing",
    "classify",
  ]
  const EDGES: [string, string, string][] = [
    ["refund_problem_gate", "problem", "reply_help_problem"],
    ["refund_problem_gate", "no_problem", "reply_save_no_problem"],
    ["await_save_no_problem_reply", "accepted", "stop_do_nothing"],
    ["await_save_no_problem_reply", "not_accepted", "refund_issue"],
    ["await_save_no_problem_reply", "new_topic", "classify"],
    ["await_help_problem_reply", "complete", "stop_do_nothing"],
    ["await_help_problem_reply", "wants_refund", "refund_issue"],
    ["await_help_problem_reply", "general", "reply_help_problem"],
    ["await_help_problem_reply", "new_topic", "classify"],
  ]
  const walk = async (startKey: string, outcomes: Record<string, string>) => {
    const seen: string[] = []
    const reg: Record<string, NodeType> = Object.fromEntries(
      NODES.map((k) => [
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
      "refund_problem_gate",
      NODES.map((k) => node(k, k)),
      EDGES
    )
    await runGraph(
      g,
      reg,
      {} as StepContext,
      startKey === "refund_problem_gate" ? undefined : { startNodeKey: startKey }
    )
    return seen
  }

  it("no-problem refund → coaching offer (terminal, awaits reply)", async () => {
    expect(
      await walk("refund_problem_gate", { refund_problem_gate: "no_problem" })
    ).toEqual(["refund_problem_gate", "reply_save_no_problem"])
  })

  it("reply accepts the offer → do nothing (stop)", async () => {
    expect(
      await walk("await_save_no_problem_reply", {
        await_save_no_problem_reply: "accepted",
      })
    ).toEqual(["await_save_no_problem_reply", "stop_do_nothing"])
  })

  it("reply declines the offer → refund_issue", async () => {
    expect(
      await walk("await_save_no_problem_reply", {
        await_save_no_problem_reply: "not_accepted",
      })
    ).toEqual(["await_save_no_problem_reply", "refund_issue"])
  })

  it("problem refund → help (terminal, awaits reply)", async () => {
    expect(
      await walk("refund_problem_gate", { refund_problem_gate: "problem" })
    ).toEqual(["refund_problem_gate", "reply_help_problem"])
  })

  it("after help, still wants refund → refund_issue", async () => {
    expect(
      await walk("await_help_problem_reply", {
        await_help_problem_reply: "wants_refund",
      })
    ).toEqual(["await_help_problem_reply", "refund_issue"])
  })

  it("after help, a general question loops back to help", async () => {
    expect(
      await walk("await_help_problem_reply", {
        await_help_problem_reply: "general",
      })
    ).toEqual(["await_help_problem_reply", "reply_help_problem"])
  })
})

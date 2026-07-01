import { describe, it, expect } from "vitest"
import {
  resumeEdges,
  viewSubgraph,
  VIEW_ALL,
  type FlowNodeRow,
  type FlowEdgeRow,
} from "../flow-graph-types.js"

const node = (
  id: string,
  node_type: string,
  extra: Partial<FlowNodeRow> = {}
): FlowNodeRow => ({
  id,
  node_key: id,
  node_type,
  title: id,
  description: null,
  ai_prompt: null,
  model: null,
  config: {},
  is_active: true,
  is_start: false,
  ...extra,
})

const edge = (
  from_node_id: string,
  outcome: string,
  to_node_id: string
): FlowEdgeRow => ({ from_node_id, to_node_id, outcome, position: 0 })

// A trimmed refund tree: the reply-handling half (await → refund/stop) is linked
// by awaits_reply_at, NOT an edge — exactly like the live save-the-sale reshape.
const NODES: FlowNodeRow[] = [
  node("spam_filter", "spam_filter", { is_start: true }),
  node("classify", "classify"),
  node("order_lookup_refund", "purchase_lookup"),
  node("refund_problem_gate", "reply_branch"),
  node("reply_save_no_problem", "send_reply", {
    config: { awaits_reply_at: "await_save_no_problem_reply" },
  }),
  node("await_save_no_problem_reply", "reply_branch"),
  node("refund_issue", "refund_draft"),
  node("stop_do_nothing", "stop"),
  node("login_lookup", "purchase_lookup"), // a different branch — must stay out
]
const EDGES: FlowEdgeRow[] = [
  edge("spam_filter", "not_spam", "classify"),
  edge("classify", "refund", "order_lookup_refund"),
  edge("classify", "login_access", "login_lookup"),
  edge("order_lookup_refund", "found", "refund_problem_gate"),
  edge("refund_problem_gate", "no_problem", "reply_save_no_problem"),
  edge("await_save_no_problem_reply", "accepted", "stop_do_nothing"),
  edge("await_save_no_problem_reply", "not_accepted", "refund_issue"),
  edge("await_save_no_problem_reply", "new_topic", "classify"),
]

describe("resumeEdges", () => {
  it("turns awaits_reply_at into a synthetic 'on reply' edge", () => {
    expect(resumeEdges(NODES)).toEqual([
      {
        from_node_id: "reply_save_no_problem",
        to_node_id: "await_save_no_problem_reply",
        outcome: "on reply",
        position: 99,
      },
    ])
  })
})

describe("viewSubgraph — refund branch", () => {
  const withResume = [...EDGES, ...resumeEdges(NODES)]

  it("reaches the reply-handling half via the resume link", () => {
    const keys = viewSubgraph(NODES, withResume, "refund").nodes.map(
      (n) => n.node_key
    )
    expect(keys).toContain("reply_save_no_problem")
    expect(keys).toContain("await_save_no_problem_reply")
    expect(keys).toContain("refund_issue")
    expect(keys).toContain("stop_do_nothing")
  })

  it("keeps classify visible but does NOT re-expand its other branches (new_topic)", () => {
    const keys = viewSubgraph(NODES, withResume, "refund").nodes.map(
      (n) => n.node_key
    )
    expect(keys).toContain("classify")
    expect(keys).not.toContain("login_lookup")
  })

  it("VIEW_ALL returns the whole graph", () => {
    expect(viewSubgraph(NODES, withResume, VIEW_ALL).nodes).toHaveLength(
      NODES.length
    )
  })
})

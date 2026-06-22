import type { NodeType } from "../types.js"

// An external-API action node (e.g. issue a refund, hit the unsubscribe API).
// Each `config.outcomes` entry is a visible branch (a flow_edge), so a flow can
// fan out per API response — exactly what Ben asked for ("see a branch for each
// possible response"). Until the real adapter calls are wired (pending the
// platform API specs), it emits the configured success branch
// (config.default_outcome ?? outcomes[0]) so flows can be shaped + traced now,
// and the real per-response routing slots in without touching the graph.
//
// Draft-only invariant (firm rule): like every worker node, it NEVER executes a
// money-moving or send action. The refund / unsubscribe itself runs only at
// human approval (apps/web/lib/approvals.ts); this node routes + records intent.
export const ApiActionNode: NodeType = {
  type: "api_action",
  async run(_ctx, node) {
    const config = node.config as {
      outcomes?: unknown
      default_outcome?: unknown
    }
    const outcomes = Array.isArray(config.outcomes)
      ? config.outcomes.filter((o): o is string => typeof o === "string")
      : []
    const outcome =
      typeof config.default_outcome === "string"
        ? config.default_outcome
        : (outcomes[0] ?? "default")
    // TODO(platform-api-specs): call the adapter for config.operation and map
    // the real response → one of `outcomes`. Held until ClickBank / JVZoo /
    // Digistore + the unsubscribe (Ashish) APIs are wired.
    return { outcome }
  },
}

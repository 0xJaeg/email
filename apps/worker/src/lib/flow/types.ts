import type { ServerClient } from "@workspace/db/client"
import type Anthropic from "@anthropic-ai/sdk"
import type { GatheredContext } from "../customer-context.js"
import type { RefundDecision } from "../refund-decision.js"

// One step's config as loaded from the flow_steps table (per inbox, ordered).
export type FlowStepConfig = {
  step_key: string
  position: number
  ai_prompt: string | null
  condition: Record<string, unknown>
}

// Accumulates as steps run — each step reads what earlier steps wrote and
// returns a patch that is merged in. Shared services (supabase/anthropic/
// instructions) are set once before the flow runs.
export type StepContext = {
  email: {
    id: string
    thread_id: string | null
    from_email: string
    to_email: string
    subject: string
    body_text: string | null
    agent_mail_message_id: string | null
  }
  inboxId: string | null
  product: {
    productId: string
    adapterKey: string | null
    name: string
    supportConfig: unknown
    /** Refund-after-N-requests threshold (null = built-in default of 3). */
    refundThreshold: number | null
  } | null
  productFacts?: string
  classification?: {
    classification: string
    reasoning: string
    usage: {
      input_tokens: number
      output_tokens: number
      cache_read_input_tokens: number | null
      cache_creation_input_tokens: number | null
    }
  }
  enrichment?: GatheredContext | null
  // Set by the order_lookup / purchase_lookup nodes; EnrichStep only enriches
  // when this is true (no implicit gate).
  needsLookup?: boolean
  decision?: {
    decision: string
    template_used: string | null
    refund_request_count: number | null
    combinedReasoning: string
    llmModel: string
    sonnetUsage?: RefundDecision["sonnet_usage"]
  }
  decisionId?: string
  // Present only on a RESUMED run (the customer replied to a prior offer or
  // question). The processor sets this from the prior decision so an on-reply
  // reply_branch node can branch on the customer's new message without
  // re-classifying, and can set ctx.classification from priorDecision.
  priorDecision?: {
    decisionId: string
    decision: string
    classification: string
    template_used: string | null
    refund_request_count: number | null
    context: Record<string, unknown> | null
    resumeNodeKey: string
  }
  isReply?: boolean
  // Per-node "why" captured from reply_branch decisions (node_key -> 1-2 sentence
  // reason), accumulated across the run and persisted into
  // decisions.context.branch_reasons so the ticket trace can explain each branch.
  branchReasons?: Record<string, string>
  // The exact path the graph walk took (one entry per node visited), recorded by
  // runGraph and persisted to flow_runs/flow_run_steps for the per-ticket trace.
  path?: FlowRunStep[]
  supabase: ServerClient
  anthropic: Anthropic
}

export type Step = {
  key: string
  // Returns a patch merged into the context; `halt: true` stops the flow early.
  run(
    ctx: StepContext,
    config: FlowStepConfig
  ): Promise<Partial<StepContext> & { halt?: boolean }>
}

// --- Node + branch model (the worker walks this graph) ---

// A node as loaded from flow_nodes (per-inbox tree).
export type FlowNode = {
  id: string
  node_key: string
  node_type: string
  ai_prompt: string | null
  model: string | null
  config: Record<string, unknown>
}

// A node returns a context patch PLUS the outcome that routes the next edge.
export type NodeResult = Partial<StepContext> & {
  outcome: string
  halt?: boolean
}

export type NodeType = {
  type: string
  run(ctx: StepContext, node: FlowNode): Promise<NodeResult>
}

// The loaded tree: start node + node lookup + adjacency (fromId -> outcome -> toId).
export type FlowGraph = {
  startId: string | null
  nodes: Map<string, FlowNode>
  edges: Map<string, Map<string, string>>
}

// One recorded step of a graph walk → persisted as a flow_run_steps row for the
// per-ticket trace. node_key/node_type are snapshotted so the trace survives
// later graph edits; `halted` marks the node that stopped the flow (e.g. spam).
export type FlowRunStep = {
  node_id: string
  node_key: string
  node_type: string
  outcome: string | null
  halted: boolean
}

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
    inquiry_type: string
    reasoning: string
    usage: {
      input_tokens: number
      output_tokens: number
      cache_read_input_tokens: number | null
      cache_creation_input_tokens: number | null
    }
  }
  enrichment?: GatheredContext | null
  // Set by the order_lookup node; EnrichStep honors it (falls back to the
  // inquiry_type gate when nothing set it).
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

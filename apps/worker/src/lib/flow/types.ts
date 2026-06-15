import type { ServerClient } from "@workspace/db/client"
import type Anthropic from "@anthropic-ai/sdk"

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
  } | null
  productFacts?: string
  classification?: {
    classification: string
    inquiry_type: string
    reasoning: string
    usage: unknown
  }
  enrichment?: { context: unknown; customerContext: string } | null
  decision?: {
    decision: string
    template_used: string | null
    refund_request_count: number | null
    combinedReasoning: string
    llmModel: string
    sonnetUsage?: unknown
  }
  decisionId?: string
  supabase: ServerClient
  anthropic: Anthropic
  instructions: { classifier: string; reply: string }
}

export type Step = {
  key: string
  // Returns a patch merged into the context; `halt: true` stops the flow early.
  run(
    ctx: StepContext,
    config: FlowStepConfig
  ): Promise<Partial<StepContext> & { halt?: boolean }>
}

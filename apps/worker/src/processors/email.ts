import type { Job } from "bullmq"
import { getAnthropic } from "../lib/anthropic.js"
import { getSupabase } from "../lib/supabase.js"
import { renderProductFacts } from "../lib/product-facts.js"
import { stripQuotedReply } from "../lib/strip-quotes.js"
import { loadGraph } from "../lib/flow/load-graph.js"
import { runGraph } from "../lib/flow/run-graph.js"
import { NODE_REGISTRY } from "../lib/flow/node-registry.js"
import type { StepContext } from "../lib/flow/types.js"

export async function processEmail(job: Job) {
  const { emailId } = job.data as { emailId: string }
  console.log(`[worker] processing job ${job.id}`, { emailId })

  const supabase = getSupabase()
  const anthropic = getAnthropic()

  // Fetch the email.
  const { data: emailRow, error: emailErr } = await supabase
    .from("emails")
    .select(
      "id, thread_id, from_email, to_email, subject, body_text, agent_mail_message_id"
    )
    .eq("id", emailId)
    .single()
  if (emailErr || !emailRow) {
    throw new Error(`email_not_found: ${emailId} (${emailErr?.message ?? ""})`)
  }
  // Strip quoted reply history / forwarded chains so every step acts on the
  // customer's NEW message — not the quoted thread. Raw body stays in the DB.
  const email = { ...emailRow, body_text: stripQuotedReply(emailRow.body_text) }

  // Resolve routing (inbox + product) before the flow runs.
  const routing = await resolveRouting(supabase, email.thread_id)
  const productFacts = routing.product
    ? (renderProductFacts(
        routing.product.name,
        routing.product.supportConfig
      ) ?? undefined)
    : undefined

  // Run the per-inbox decision tree (node graph the worker walks).
  const graph = await loadGraph(supabase, routing.inboxId)
  const ctx: StepContext = {
    email,
    inboxId: routing.inboxId,
    product: routing.product,
    productFacts,
    supabase,
    anthropic,
  }
  await runGraph(graph, NODE_REGISTRY, ctx)

  // Persist the exact executed path (best-effort — the decision is already saved).
  await persistFlowRun(supabase, ctx)

  return {
    decisionId: ctx.decisionId,
    classification: ctx.classification?.classification,
    decision: ctx.decision?.decision,
  }
}

// Record the path the graph walked (one flow_runs row + one flow_run_steps row
// per node visited, in order) so the ticket page can show the real steps + the
// branch taken at each. The decision is already persisted by this point, so a
// failure here only loses the trace, never the decision — log and move on.
async function persistFlowRun(
  supabase: ReturnType<typeof getSupabase>,
  ctx: StepContext
): Promise<void> {
  const path = ctx.path ?? []
  if (path.length === 0) return
  try {
    const { data: run, error } = await supabase
      .from("flow_runs")
      .insert({
        email_id: ctx.email.id,
        decision_id: ctx.decisionId ?? null,
        inbox_id: ctx.inboxId,
        halted: path.some((s) => s.halted),
      })
      .select("id")
      .single()
    if (error || !run) {
      console.warn(
        `[flow] flow_run persist failed: ${error?.message ?? "no row"}`
      )
      return
    }
    const steps = path.map((s, i) => ({
      run_id: run.id,
      seq: i,
      node_id: s.node_id,
      node_key: s.node_key,
      node_type: s.node_type,
      outcome: s.outcome,
    }))
    const { error: stepsErr } = await supabase
      .from("flow_run_steps")
      .insert(steps)
    if (stepsErr) {
      console.warn(`[flow] flow_run_steps persist failed: ${stepsErr.message}`)
    }
  } catch (err) {
    // Observability only — never let trace persistence break email processing.
    console.warn(`[flow] flow_run persist threw: ${(err as Error).message}`)
  }
}

// Resolve the thread's inbox + product (+ which adapter handles it). Returns
// nulls for un-routed / legacy threads — the flow still runs; enrichment is
// skipped without an adapter, and loadFlow falls back to the global default.
async function resolveRouting(
  supabase: ReturnType<typeof getSupabase>,
  threadId: string | null
): Promise<{ inboxId: string | null; product: StepContext["product"] }> {
  if (!threadId) return { inboxId: null, product: null }
  const { data: thread } = await supabase
    .from("threads")
    .select("product_id, inbox_id")
    .eq("id", threadId)
    .maybeSingle()
  const inboxId = thread?.inbox_id ?? null
  if (!thread?.product_id) return { inboxId, product: null }
  const { data: product } = await supabase
    .from("products")
    .select("name, adapter_key, support_config, refund_threshold")
    .eq("id", thread.product_id)
    .maybeSingle()
  return {
    inboxId,
    product: {
      productId: thread.product_id,
      adapterKey: product?.adapter_key ?? null,
      name: product?.name ?? "the product",
      supportConfig: product?.support_config ?? null,
      refundThreshold: product?.refund_threshold ?? null,
    },
  }
}

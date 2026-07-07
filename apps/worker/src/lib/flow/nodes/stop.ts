import type { NodeType } from "../types.js"

// Terminal "do nothing" node: the customer accepted the retention offer or is
// happy after we helped, so there is nothing to send or refund. Records a
// lightweight decision (status 'closed', which the thread_tickets view buckets
// as done) so the ticket closes cleanly and the trace is complete. Sends nothing.
export const StopNode: NodeType = {
  type: "stop",
  async run(ctx) {
    const { email, supabase, product } = ctx
    const cls = ctx.classification
    const { data: row, error } = await supabase
      .from("decisions")
      .insert({
        email_id: email.id,
        product_id: product?.productId ?? null,
        classification: cls?.classification ?? null,
        decision: "do_nothing",
        llm_model: "claude-haiku-4-5",
        llm_reasoning: cls?.reasoning ?? null,
        status: "closed",
        proposed_actions: [],
        // Carry the branch "why" (e.g. the accept-reply read that led here) so the
        // trace explains why the ticket closed with no send/refund.
        context: {
          ...(cls?.reasoning ? { classification_reasoning: cls.reasoning } : {}),
          ...(ctx.branchReasons && Object.keys(ctx.branchReasons).length > 0
            ? { branch_reasons: ctx.branchReasons }
            : {}),
        },
      })
      .select("id")
      .single()
    if (error || !row) {
      throw new Error(`stop_decision_insert_failed: ${error?.message ?? "no row"}`)
    }
    await supabase.from("audit_log").insert({
      action: "flow_stop_do_nothing",
      email_id: email.id,
      status: "success",
      payload: { decision_id: row.id },
    })
    return { decisionId: row.id, outcome: "done", halt: true }
  },
}

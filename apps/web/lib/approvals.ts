"use server"

import { sendReply } from "@workspace/actions/send-reply"
import { refundCustomer } from "@workspace/actions/refund-customer"
import { getAgentMailInboxId } from "@workspace/actions/agent-mail"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getActionSupabase } from "@/lib/supabase/server"

export async function approveRefund(decisionId: string): Promise<void> {
  const { user } = await getActionSupabase()
  const approvedBy = user.email ?? user.id
  const supabase = getServerSupabase()

  // Race-safe state transition: only proceed if still pending_approval.
  const { data: claimed, error: claimErr } = await supabase
    .from("decisions")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
    })
    .eq("id", decisionId)
    .eq("status", "pending_approval")
    .select(
      "id, draft_reply_text, emails(id, from_email, subject, agent_mail_message_id, body_text)"
    )
    .maybeSingle()

  if (claimErr) throw new Error(`approveRefund.claim: ${claimErr.message}`)
  if (!claimed) {
    // Already handled by another approver — no-op.
    await supabase.from("audit_log").insert({
      action: "approve_refund_noop",
      status: "skipped",
      payload: {
        decision_id: decisionId,
        reason: "not_pending_or_already_handled",
      },
    })
    return
  }

  const emailRow = Array.isArray(claimed.emails)
    ? claimed.emails[0]
    : claimed.emails
  if (!emailRow)
    throw new Error(
      `approveRefund: email row missing for decision ${decisionId}`
    )

  const orderId = extractOrderId(emailRow.body_text)

  // Refund first.
  const refund = await refundCustomer({
    decisionId,
    customerEmail: emailRow.from_email,
    orderId,
    amount: null,
    supabase,
  })
  if (!refund.ok) {
    // Rewind status so a human can retry.
    await supabase
      .from("decisions")
      .update({
        status: "pending_approval",
        approved_at: null,
        approved_by: null,
      })
      .eq("id", decisionId)
    await supabase.from("audit_log").insert({
      action: "approve_refund_failed",
      status: "failure",
      error: refund.error,
      payload: { decision_id: decisionId, step: "refundCustomer" },
    })
    return
  }

  // Notify second. getAgentMailInboxId() throws if env is unset — catch it
  // here so the partial state (refund succeeded, notify failed) is recorded
  // rather than leaving the decision in limbo.
  const sent = await (async () => {
    let inboxId: string
    try {
      inboxId = getAgentMailInboxId()
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return { ok: false as const, error }
    }
    return sendReply({
      inboxId,
      inReplyToMessageId: emailRow.agent_mail_message_id ?? "",
      replyText: claimed.draft_reply_text ?? "",
      decisionId,
      emailId: emailRow.id,
      to: emailRow.from_email,
      subject: `Re: ${emailRow.subject}`,
      supabase,
    })
  })()

  if (sent.ok) {
    await supabase
      .from("decisions")
      .update({ status: "sent" })
      .eq("id", decisionId)
  } else {
    // Refund succeeded but notify failed — capture the partial state.
    await supabase
      .from("decisions")
      .update({ status: "failed" })
      .eq("id", decisionId)
    await supabase.from("audit_log").insert({
      action: "approve_refund_failed",
      status: "failure",
      error: sent.error,
      payload: {
        decision_id: decisionId,
        step: "sendReply",
        refund_id_already_issued: refund.refundId,
      },
    })
  }
}

export async function rejectRefund(
  decisionId: string,
  reason?: string
): Promise<void> {
  const { user } = await getActionSupabase()
  const approvedBy = user.email ?? user.id
  const supabase = getServerSupabase()
  const { data: claimed, error } = await supabase
    .from("decisions")
    .update({
      status: "rejected",
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
    })
    .eq("id", decisionId)
    .eq("status", "pending_approval")
    .select("id")
    .maybeSingle()
  if (error) throw new Error(`rejectRefund: ${error.message}`)
  await supabase.from("audit_log").insert({
    action: claimed ? "reject_refund" : "reject_refund_noop",
    status: claimed ? "success" : "skipped",
    payload: { decision_id: decisionId, reason: reason ?? null },
  })
}

const ORDER_RE = /order\s*#?\s*([A-Z0-9-]+)/i

function extractOrderId(body: string | null): string | null {
  if (!body) return null
  const m = body.match(ORDER_RE)
  return m ? (m[1] ?? null) : null
}

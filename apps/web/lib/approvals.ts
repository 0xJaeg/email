"use server"

import { sendReply } from "@workspace/actions/send-reply"
import { refundCustomer } from "@workspace/actions/refund-customer"
import { suppressContact } from "@workspace/actions/suppress-contact"
import { getAgentMailInboxId } from "@workspace/actions/agent-mail"
import type { ProposedAction } from "@workspace/actions/types"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getActionSupabase } from "@/lib/supabase/server"

export async function approveDecision(
  decisionId: string,
  editedText?: string
): Promise<void> {
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
      "id, draft_reply_text, proposed_actions, emails(id, from_email, subject, agent_mail_message_id, body_text, thread_id)"
    )
    .maybeSingle()

  if (claimErr) throw new Error(`approveDecision.claim: ${claimErr.message}`)
  if (!claimed) {
    // Already handled by another approver — no-op.
    await supabase.from("audit_log").insert({
      action: "approve_decision_noop",
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
      `approveDecision: email row missing for decision ${decisionId}`
    )

  // If the operator edited the draft before approving, that edited text is what
  // we send (and store) — record the edit for the audit trail.
  const trimmedEdit = editedText?.trim()
  const replyText =
    trimmedEdit && trimmedEdit !== (claimed.draft_reply_text ?? "").trim()
      ? trimmedEdit
      : (claimed.draft_reply_text ?? "")
  const wasEdited = replyText !== (claimed.draft_reply_text ?? "")
  if (wasEdited) {
    await supabase
      .from("decisions")
      .update({ draft_reply_text: replyText })
      .eq("id", decisionId)
    await supabase.from("audit_log").insert({
      action: "draft_edited",
      email_id: emailRow.id,
      status: "success",
      payload: { decision_id: decisionId, edited_by: approvedBy },
    })
  }

  // Execute the proposed mutating actions in order. Any failure rewinds the
  // approval (so a human can retry) and stops before the reply is sent.
  const actions = (claimed.proposed_actions as ProposedAction[] | null) ?? []
  const rewind = async (step: string, error: string) => {
    await supabase
      .from("decisions")
      .update({
        status: "pending_approval",
        approved_at: null,
        approved_by: null,
      })
      .eq("id", decisionId)
    await supabase.from("audit_log").insert({
      action: "approve_decision_failed",
      status: "failure",
      error,
      payload: { decision_id: decisionId, step },
    })
  }

  let refundId: string | null = null
  for (const action of actions) {
    if (action.type === "issue_refund") {
      const orderId = extractOrderId(emailRow.body_text)
      const adapterKey = await resolveAdapterKey(supabase, emailRow.thread_id)
      const refund = await refundCustomer({
        decisionId,
        emailId: emailRow.id,
        customerEmail: emailRow.from_email,
        orderId,
        amount: null,
        adapterKey,
        supabase,
      })
      if (!refund.ok) {
        await rewind("issue_refund", refund.error)
        return
      }
      refundId = refund.refundId
    } else if (action.type === "suppress_contact") {
      const suppressed = await suppressContact({
        decisionId,
        emailId: emailRow.id,
        email: emailRow.from_email,
        reason: action.reason,
        supabase,
      })
      if (!suppressed.ok) {
        await rewind("suppress_contact", suppressed.error)
        return
      }
    }
  }

  // Notify. getAgentMailInboxId() throws if env is unset — catch it here so a
  // partial state (refund succeeded, notify failed) is recorded rather than
  // leaving the decision in limbo.
  const sent = await (async () => {
    let inboxId: string
    try {
      inboxId = await resolveSenderInbox(supabase, emailRow.thread_id)
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return { ok: false as const, error }
    }
    return sendReply({
      inboxId,
      inReplyToMessageId: emailRow.agent_mail_message_id ?? "",
      replyText,
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
    // Reply failed to send — capture the partial state (and any refund issued).
    await supabase
      .from("decisions")
      .update({ status: "failed" })
      .eq("id", decisionId)
    await supabase.from("audit_log").insert({
      action: "approve_decision_failed",
      status: "failure",
      error: sent.error,
      payload: {
        decision_id: decisionId,
        step: "sendReply",
        ...(refundId ? { refund_id_already_issued: refundId } : {}),
      },
    })
  }
}

export async function rejectDecision(
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
  if (error) throw new Error(`rejectDecision: ${error.message}`)
  await supabase.from("audit_log").insert({
    action: claimed ? "reject_decision" : "reject_decision_noop",
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

// Reply from the inbox the thread belongs to (multi-inbox). Falls back to the
// single-inbox env for threads with no routed inbox (backfilled / pre-routing).
async function resolveSenderInbox(
  supabase: ReturnType<typeof getServerSupabase>,
  threadId: string | null
): Promise<string> {
  if (threadId) {
    const { data: thread } = await supabase
      .from("threads")
      .select("inbox_id")
      .eq("id", threadId)
      .maybeSingle()
    if (thread?.inbox_id) {
      const { data: inbox } = await supabase
        .from("inboxes")
        .select("agent_mail_inbox_id")
        .eq("id", thread.inbox_id)
        .maybeSingle()
      if (inbox?.agent_mail_inbox_id) return inbox.agent_mail_inbox_id
    }
  }
  return getAgentMailInboxId()
}

// The product adapter that executes a refund for this thread's product.
// Defaults to the safe mock adapter for un-routed / legacy threads.
async function resolveAdapterKey(
  supabase: ReturnType<typeof getServerSupabase>,
  threadId: string | null
): Promise<string> {
  if (threadId) {
    const { data: thread } = await supabase
      .from("threads")
      .select("product_id")
      .eq("id", threadId)
      .maybeSingle()
    if (thread?.product_id) {
      const { data: product } = await supabase
        .from("products")
        .select("adapter_key")
        .eq("id", thread.product_id)
        .maybeSingle()
      if (product?.adapter_key) return product.adapter_key
    }
  }
  return "mock"
}

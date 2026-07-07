"use server"

import { refundCustomer } from "@workspace/actions/refund-customer"
import { suppressContact } from "@workspace/actions/suppress-contact"
import { coachingSignup } from "@workspace/actions/coaching-signup"
import type { ProposedAction } from "@workspace/actions/types"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getActionSupabase } from "@/lib/supabase/server"
import { resolveSenderInbox } from "@/lib/sender-inbox"
import { getReplySignature, withSignature } from "@/lib/reply-signature"
import { getSendsQueue } from "@/lib/queue"
import { getAppSettings, countRefundsToday } from "@/lib/settings"
import { sendInternalAlert } from "@workspace/actions/send-internal-alert"

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
      "id, draft_reply_text, proposed_actions, context, emails!decisions_email_id_fkey(id, from_email, subject, agent_mail_message_id, body_text, thread_id)"
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
      // Daily refund cap — a safety brake. Refunds execute here (at approval),
      // so this is the enforcement point: once today's executed refunds hit the
      // configured limit, stop and leave the decision pending for a human to
      // revisit when the window resets (or the limit is raised).
      const refundLimit = (await getAppSettings(supabase)).refundDailyLimit
      const refundsToday =
        refundLimit != null ? await countRefundsToday(supabase) : 0
      if (refundLimit != null && refundsToday >= refundLimit) {
        await supabase
          .from("decisions")
          .update({
            status: "pending_approval",
            approved_at: null,
            approved_by: null,
          })
          .eq("id", decisionId)
        await supabase.from("audit_log").insert({
          action: "refund_blocked_daily_limit",
          email_id: emailRow.id,
          status: "blocked",
          payload: {
            decision_id: decisionId,
            limit: refundLimit,
            count: refundsToday,
          },
        })
        await alertRefundLimitReached(supabase, refundLimit, refundsToday)
        return
      }
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
        // Refund attempt failed at the gateway — assign to a human (Ben's
        // "not successful → assign to human") instead of silently retrying.
        await supabase
          .from("decisions")
          .update({
            status: "needs_human",
            approved_at: null,
            approved_by: null,
          })
          .eq("id", decisionId)
        await supabase.from("audit_log").insert({
          action: "approve_decision_refund_failed",
          email_id: emailRow.id,
          status: "failure",
          error: refund.error,
          payload: { decision_id: decisionId, step: "issue_refund" },
        })
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
    } else if (action.type === "coaching_signup") {
      // Save-the-sale: subscribe them to the coaching series. Best-effort — a
      // failed / not-yet-configured signup must NOT block the retention reply,
      // so we never rewind here (coachingSignup audits the outcome itself).
      await coachingSignup({
        decisionId,
        emailId: emailRow.id,
        email: emailRow.from_email,
        list: action.list,
        supabase,
      })
    }
  }

  // Resolve the send target now. resolveSenderInbox() throws if the thread has
  // no registered inbox — handle it here so a partial state (refund succeeded,
  // notify failed) is recorded rather than leaving the decision in limbo.
  let inboxId: string
  try {
    inboxId = await resolveSenderInbox(supabase, emailRow.thread_id)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await supabase
      .from("decisions")
      .update({ status: "failed" })
      .eq("id", decisionId)
    await supabase.from("audit_log").insert({
      action: "approve_decision_failed",
      status: "failure",
      error,
      payload: {
        decision_id: decisionId,
        step: "resolve_inbox",
        ...(refundId ? { refund_id_already_issued: refundId } : {}),
      },
    })
    return
  }

  // Send asynchronously via the sends queue, optionally after a per-node delay
  // so the reply feels hand-written rather than instant. The refund/suppress
  // actions above already ran — only the email waits. The send worker flips the
  // decision to sent/failed; until then it stays 'approved' (in-flight).
  const signature = await getReplySignature(supabase, emailRow.thread_id)
  const delayMs = randomSendDelayMs(claimed.context)
  const awaitsReplyAt = readAwaitsReplyAt(claimed.context)
  await getSendsQueue().add(
    "send_reply",
    {
      decisionId,
      emailId: emailRow.id,
      inboxId,
      inReplyToMessageId: emailRow.agent_mail_message_id ?? "",
      replyText: withSignature(replyText, signature),
      to: emailRow.from_email,
      subject: `Re: ${emailRow.subject}`,
      // When the customer replies to this offer/question, the send worker uses
      // these to stamp the thread's resume cursor (only after the send lands).
      awaitsReplyAt,
      threadId: emailRow.thread_id,
    },
    { delay: delayMs }
  )
  await supabase.from("audit_log").insert({
    action: "reply_scheduled",
    email_id: emailRow.id,
    status: "success",
    payload: { decision_id: decisionId, delay_ms: delayMs },
  })
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

// Random delay (ms) for the outbound reply, from the send_delay range (minutes)
// the draft step stamped on the decision context. Missing / 0 → send now.
function randomSendDelayMs(context: unknown): number {
  if (!context || typeof context !== "object") return 0
  const d = (context as Record<string, unknown>).send_delay
  if (!d || typeof d !== "object") return 0
  const { min, max } = d as { min?: unknown; max?: unknown }
  const lo = Math.max(0, Number(min) || 0)
  const hi = Math.max(lo, Number(max) || 0)
  if (hi === 0) return 0
  return Math.round((lo + Math.random() * (hi - lo)) * 60_000)
}

// The resume node_key the draft step stamped on the decision context (the node
// the customer's reply should resume at). Null when this reply awaits nothing.
function readAwaitsReplyAt(context: unknown): string | null {
  if (!context || typeof context !== "object") return null
  const v = (context as Record<string, unknown>).awaits_reply_at
  return typeof v === "string" && v ? v : null
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

// Email the configured recipients when the daily refund cap is hit — once per
// UTC day (deduped via the audit log), so a run of capped approvals doesn't spam.
async function alertRefundLimitReached(
  supabase: ReturnType<typeof getServerSupabase>,
  limit: number,
  count: number
): Promise<void> {
  const now = new Date()
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString()
  const { data: prior } = await supabase
    .from("audit_log")
    .select("id")
    .eq("action", "send_internal_alert")
    .gte("created_at", since)
    .contains("payload", { kind: "refund_daily_limit" })
    .limit(1)
    .maybeSingle()
  if (prior) return
  const recipients = (await getAppSettings(supabase)).refundAlertRecipients
  await sendInternalAlert({
    subject: `Refund daily cap reached (${count}/${limit})`,
    body:
      `The daily refund cap of ${limit} has been reached ` +
      `(${count} refunds executed today, UTC).\n\n` +
      `Further refund approvals are paused until tomorrow or until the cap is ` +
      `raised in Settings. Pending refund decisions stay in the approvals queue.`,
    recipients,
    kind: "refund_daily_limit",
    supabase,
  })
}

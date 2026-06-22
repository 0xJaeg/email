import { getAgentMailClient } from "./agent-mail.js"
import type { ServerClient } from "@workspace/db/client"

export type SendInternalAlertArgs = {
  subject: string
  body: string
  recipients: string[]
  /** Short kind for the audit log + once-per-day dedupe (e.g. "refund_daily_limit"). */
  kind: string
  supabase: ServerClient
}

export type SendInternalAlertResult = { ok: boolean; error?: string }

// Send an internal ops alert to the configured recipients, reusing the same
// authenticated AgentMail client as customer replies (no new infra). Best-effort
// + audited as `send_internal_alert`. The "from" inbox is ALERT_FROM_INBOX_ID,
// else the oldest active inbox. Never throws — callers fire it and forget.
export async function sendInternalAlert(
  args: SendInternalAlertArgs
): Promise<SendInternalAlertResult> {
  const { supabase } = args
  if (args.recipients.length === 0) {
    await supabase.from("audit_log").insert({
      action: "send_internal_alert",
      status: "skipped",
      payload: { kind: args.kind, reason: "no_recipients" },
    })
    return { ok: false, error: "no_recipients" }
  }

  let inboxId = process.env.ALERT_FROM_INBOX_ID ?? ""
  if (!inboxId) {
    const { data: inbox } = await supabase
      .from("inboxes")
      .select("agent_mail_inbox_id")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    inboxId = inbox?.agent_mail_inbox_id ?? ""
  }
  if (!inboxId) {
    await supabase.from("audit_log").insert({
      action: "send_internal_alert",
      status: "failure",
      error: "no_from_inbox",
      payload: { kind: args.kind },
    })
    return { ok: false, error: "no_from_inbox" }
  }

  try {
    const sent = await getAgentMailClient().inboxes.messages.send(inboxId, {
      to: args.recipients,
      subject: args.subject,
      text: args.body,
    })
    await supabase.from("audit_log").insert({
      action: "send_internal_alert",
      status: "success",
      payload: {
        kind: args.kind,
        recipients: args.recipients,
        sent_message_id: sent.messageId,
      },
    })
    return { ok: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await supabase.from("audit_log").insert({
      action: "send_internal_alert",
      status: "failure",
      error,
      payload: { kind: args.kind },
    })
    return { ok: false, error }
  }
}

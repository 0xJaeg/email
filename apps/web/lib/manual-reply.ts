"use server"

import { revalidatePath } from "next/cache"
import { sendReply } from "@workspace/actions/send-reply"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getActionSupabase } from "@/lib/supabase/server"
import { resolveSenderInbox } from "@/lib/sender-inbox"
import { getReplySignature, withSignature } from "@/lib/reply-signature"

type Result = { error: boolean; message: string }

// A human takes over a thread and sends a reply themselves — used mainly for
// escalated (needs_human) tickets the agent didn't draft. Sends from the
// thread's registered inbox (fail-loud if none), records the reply on the
// thread's latest decision so it shows in the conversation, and audits who
// sent it. Never auto-runs any proposed actions — this is a plain reply.
export async function sendManualReply(
  threadId: string,
  replyText: string
): Promise<Result> {
  const { user } = await getActionSupabase()
  const sentBy = user.email ?? user.id
  const supabase = getServerSupabase()

  const text = replyText.trim()
  if (!text) return { error: true, message: "The reply can't be empty." }

  // The customer message we're replying to (newest inbound in the thread).
  const { data: email } = await supabase
    .from("emails")
    .select("id, agent_mail_message_id, from_email, subject")
    .eq("thread_id", threadId)
    .eq("direction", "inbound")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!email) {
    return { error: true, message: "No customer message to reply to." }
  }

  let inboxId: string
  try {
    inboxId = await resolveSenderInbox(supabase, threadId)
  } catch (err) {
    return {
      error: true,
      message: err instanceof Error ? err.message : "No sender inbox.",
    }
  }

  // The decision for that message (if any) — we record the reply on it so the
  // conversation timeline shows it, and mark the ticket handled.
  const { data: decision } = await supabase
    .from("decisions")
    .select("id")
    .eq("email_id", email.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const subject = email.subject?.toLowerCase().startsWith("re:")
    ? email.subject
    : `Re: ${email.subject ?? ""}`.trim()

  const signature = await getReplySignature(supabase, threadId)
  const sent = await sendReply({
    inboxId,
    inReplyToMessageId: email.agent_mail_message_id ?? "",
    replyText: withSignature(text, signature),
    decisionId: decision?.id ?? "",
    emailId: email.id,
    to: email.from_email,
    subject,
    supabase,
  })
  if (!sent.ok) return { error: true, message: sent.error }

  if (decision) {
    await supabase
      .from("decisions")
      .update({
        status: "sent",
        draft_reply_text: text,
        approved_by: sentBy,
        approved_at: new Date().toISOString(),
      })
      .eq("id", decision.id)
  }
  await supabase.from("audit_log").insert({
    action: "manual_reply",
    email_id: email.id,
    status: "success",
    payload: {
      decision_id: decision?.id ?? null,
      sent_by: sentBy,
      to: email.from_email,
    },
  })

  revalidatePath(`/tickets/${threadId}`)
  revalidatePath("/tickets")
  return { error: false, message: "Reply sent." }
}

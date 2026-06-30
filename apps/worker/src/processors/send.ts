import type { Job } from "bullmq"
import { sendReply } from "@workspace/actions/send-reply"
import { getSupabase } from "../lib/supabase.js"

// One approved customer reply, enqueued by approveDecision (apps/web) with an
// optional delay so it lands on a human-feeling delay instead of instantly.
// The decision is already "approved" at this point; we flip it to "sent" or
// "failed" here. sendReply itself writes the send_reply audit entry.
type SendJob = {
  decisionId: string
  emailId: string
  inboxId: string
  inReplyToMessageId: string
  replyText: string
  to: string
  subject: string
}

export async function processSend(job: Job) {
  const d = job.data as SendJob
  console.log(`[worker] sending reply job ${job.id}`, {
    decisionId: d.decisionId,
  })
  const supabase = getSupabase()
  const sent = await sendReply({
    inboxId: d.inboxId,
    inReplyToMessageId: d.inReplyToMessageId,
    replyText: d.replyText,
    decisionId: d.decisionId,
    emailId: d.emailId,
    to: d.to,
    subject: d.subject,
    supabase,
  })
  await supabase
    .from("decisions")
    .update({ status: sent.ok ? "sent" : "failed" })
    .eq("id", d.decisionId)
}

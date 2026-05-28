import { getAgentMailClient } from "./agent-mail.js"
import type { SendReplyArgs, SendReplyResult } from "./types.js"

export async function sendReply(args: SendReplyArgs): Promise<SendReplyResult> {
  const client = getAgentMailClient()
  try {
    const sent = await client.inboxes.messages.reply(
      args.inboxId,
      args.inReplyToMessageId,
      { text: args.replyText }
    )
    await args.supabase.from("audit_log").insert({
      action: "send_reply",
      status: "success",
      payload: {
        decision_id: args.decisionId,
        in_reply_to: args.inReplyToMessageId,
        sent_message_id: sent.messageId,
      },
    })
    return { ok: true, sentMessageId: sent.messageId }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await args.supabase.from("audit_log").insert({
      action: "send_reply",
      status: "failure",
      error,
      payload: {
        decision_id: args.decisionId,
        in_reply_to: args.inReplyToMessageId,
      },
    })
    return { ok: false, error }
  }
}

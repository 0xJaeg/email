import { getAgentMailClient } from "./agent-mail.js"
import { renderReplyHtml } from "./render-reply-html.js"
import type { SendReplyArgs, SendReplyResult } from "./types.js"

export async function sendReply(args: SendReplyArgs): Promise<SendReplyResult> {
  const client = getAgentMailClient()
  // Real Agent Mail message ids start with "msg_". When we have one (genuine
  // inbound), thread the reply. Otherwise (simulated webhook, or no message)
  // send a fresh message to the customer — reply() would 404 on a message that
  // doesn't exist in the inbox.
  const threaded = args.inReplyToMessageId.startsWith("msg_")
  // Send multipart: the plain text we generated + an HTML rendering of it, so
  // the customer's client shows a properly-formatted email (paragraphs + links)
  // and text-only clients still get the original.
  const html = renderReplyHtml(args.replyText)
  try {
    const sent = threaded
      ? await client.inboxes.messages.reply(
          args.inboxId,
          args.inReplyToMessageId,
          { text: args.replyText, html }
        )
      : await client.inboxes.messages.send(args.inboxId, {
          to: [args.to],
          subject: args.subject,
          text: args.replyText,
          html,
        })
    await args.supabase.from("audit_log").insert({
      action: "send_reply",
      email_id: args.emailId,
      status: "success",
      payload: {
        decision_id: args.decisionId,
        in_reply_to: args.inReplyToMessageId,
        sent_message_id: sent.messageId,
        via: threaded ? "reply" : "send",
        to: args.to,
        reply_text: args.replyText,
      },
    })
    return { ok: true, sentMessageId: sent.messageId }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await args.supabase.from("audit_log").insert({
      action: "send_reply",
      email_id: args.emailId,
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

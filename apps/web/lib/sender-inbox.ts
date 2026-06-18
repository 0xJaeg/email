import type { ServerClient } from "@workspace/db/client"

// Reply from the inbox the thread belongs to (multi-inbox). Every inbox the
// agent answers is registered in /inboxes; if a thread has no registered inbox
// we fail loudly rather than guess a global sender (which could reply from the
// wrong address/domain). Shared by the approval + manual-reply paths.
export async function resolveSenderInbox(
  supabase: ServerClient,
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
  throw new Error(
    "no_sender_inbox: this thread has no registered Agent Mail inbox — add it in Inboxes"
  )
}

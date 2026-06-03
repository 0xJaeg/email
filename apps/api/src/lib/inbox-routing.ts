import type { ServerClient } from "@workspace/db/client"

export type InboxRouting = {
  productId: string | null
  inboxId: string | null
}

// Maps an Agent Mail inbox id to our product + inbox. Unknown inboxes are
// audited and fall back to the default product so inbound email is never
// dropped — it still lands in the approval queue for a human to handle.
export async function resolveInboxRouting(
  supabase: ServerClient,
  agentMailInboxId: string
): Promise<InboxRouting> {
  const { data: inbox } = await supabase
    .from("inboxes")
    .select("id, product_id")
    .eq("agent_mail_inbox_id", agentMailInboxId)
    .maybeSingle()

  if (inbox) return { productId: inbox.product_id, inboxId: inbox.id }

  const { data: fallback } = await supabase
    .from("products")
    .select("id")
    .eq("slug", "default")
    .maybeSingle()

  await supabase.from("audit_log").insert({
    action: "unknown_inbox",
    status: "success",
    payload: {
      agent_mail_inbox_id: agentMailInboxId,
      fell_back_to: fallback?.id ?? null,
    },
  })

  return { productId: fallback?.id ?? null, inboxId: null }
}

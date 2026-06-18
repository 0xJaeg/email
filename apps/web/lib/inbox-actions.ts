"use server"

import { revalidatePath } from "next/cache"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import { createAgentMailInbox } from "@workspace/actions/agent-mail"
import type { ServerClient } from "@workspace/db/client"

type Result = { error: boolean; message: string }

async function requireAdmin(): Promise<
  { ok: true; admin: ServerClient } | { ok: false }
> {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (caller?.role !== "admin") return { ok: false }
  return { ok: true, admin }
}

function friendly(error: { code: string; message: string }): string {
  if (error.code === "23505")
    return "An inbox with that Agent Mail id already exists."
  if (error.code === "23503") return "That product no longer exists."
  return error.message
}

// Create provisions a NEW Agent Mail inbox (username@agentmail.to) via the API,
// then records the inbox -> product mapping. The agent_mail_inbox_id is the
// provisioned address and is immutable afterwards, so our DB never drifts from
// Agent Mail.
export async function createInbox(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }

  const product_id = String(formData.get("product_id") ?? "")
  const username = String(formData.get("username") ?? "").trim()
  const display_name = String(formData.get("display_name") ?? "").trim()
  const is_active = String(formData.get("is_active") ?? "active") === "active"

  if (!product_id) return { error: true, message: "Product is required." }
  if (!/^[a-zA-Z0-9._-]+$/.test(username))
    return {
      error: true,
      message:
        "Username can only contain letters, numbers, dots, dashes and underscores.",
    }
  if (!display_name)
    return { error: true, message: "Display name is required." }

  let inboxId: string
  let created: boolean
  try {
    const res = await createAgentMailInbox({
      username,
      displayName: display_name,
    })
    inboxId = res.inboxId
    created = res.created
  } catch (err) {
    const base =
      err instanceof Error ? err.message : "Failed to create the inbox."
    return { error: true, message: `Couldn't reach AgentMail: ${base}` }
  }

  // Upsert so re-adding an inbox that already exists on Agent Mail links it
  // rather than failing on the unique agent_mail_inbox_id.
  const { error } = await auth.admin
    .from("inboxes")
    .upsert(
      { product_id, agent_mail_inbox_id: inboxId, is_active },
      { onConflict: "agent_mail_inbox_id" }
    )
  if (error) return { error: true, message: friendly(error) }
  revalidatePath("/inboxes")
  return {
    error: false,
    message: created ? "Inbox created." : "Linked existing Agent Mail inbox.",
  }
}

// Update only the mapping + status — the provisioned agent_mail_inbox_id never
// changes (editing it would desync the DB from Agent Mail).
export async function updateInbox(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const id = String(formData.get("id") ?? "")
  if (!id) return { error: true, message: "Missing inbox id." }
  const product_id = String(formData.get("product_id") ?? "")
  if (!product_id) return { error: true, message: "Product is required." }
  const is_active = String(formData.get("is_active") ?? "active") === "active"

  const { error } = await auth.admin
    .from("inboxes")
    .update({ product_id, is_active })
    .eq("id", id)
  if (error) return { error: true, message: friendly(error) }
  revalidatePath("/inboxes")
  return { error: false, message: "Inbox updated." }
}

export async function deleteInbox(id: string): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const { error } = await auth.admin.from("inboxes").delete().eq("id", id)
  if (error) return { error: true, message: error.message }
  revalidatePath("/inboxes")
  return { error: false, message: "Inbox deleted." }
}

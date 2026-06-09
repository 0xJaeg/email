"use server"

import { revalidatePath } from "next/cache"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
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

function parse(formData: FormData) {
  const address = String(formData.get("address") ?? "").trim()
  return {
    product_id: String(formData.get("product_id") ?? ""),
    agent_mail_inbox_id: String(formData.get("agent_mail_inbox_id") ?? "").trim(),
    address: address || null,
    is_active: String(formData.get("is_active") ?? "active") === "active",
  }
}

function validate(p: ReturnType<typeof parse>): string | null {
  if (!p.product_id) return "Product is required."
  if (!p.agent_mail_inbox_id) return "Agent Mail inbox id is required."
  return null
}

function friendly(error: { code: string; message: string }): string {
  if (error.code === "23505")
    return "An inbox with that Agent Mail id already exists."
  if (error.code === "23503") return "That product no longer exists."
  return error.message
}

export async function createInbox(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const p = parse(formData)
  const invalid = validate(p)
  if (invalid) return { error: true, message: invalid }

  const { error } = await auth.admin.from("inboxes").insert(p)
  if (error) return { error: true, message: friendly(error) }
  revalidatePath("/inboxes")
  return { error: false, message: "Inbox created." }
}

export async function updateInbox(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const id = String(formData.get("id") ?? "")
  if (!id) return { error: true, message: "Missing inbox id." }
  const p = parse(formData)
  const invalid = validate(p)
  if (invalid) return { error: true, message: invalid }

  const { error } = await auth.admin.from("inboxes").update(p).eq("id", id)
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

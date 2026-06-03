"use server"

import { revalidatePath } from "next/cache"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import type { ServerClient } from "@workspace/db/client"

type Result = { error: boolean; message: string }

// Authorize: only an admin may edit prompts. Server actions are independently
// invokable endpoints, so this is the real security boundary (not the page gate).
async function requireAdmin(): Promise<
  { ok: true; admin: ServerClient; callerEmail: string } | { ok: false }
> {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (caller?.role !== "admin") return { ok: false }
  return { ok: true, admin, callerEmail: user.email ?? user.id }
}

export async function updatePrompt(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const { admin, callerEmail } = auth

  const id = String(formData.get("id") ?? "")
  const content = String(formData.get("content") ?? "")
  if (!id) return { error: true, message: "Missing prompt id." }
  if (!content.trim()) return { error: true, message: "Content can't be empty." }

  const { data: current } = await admin
    .from("prompt_configs")
    .select("version")
    .eq("id", id)
    .single()

  const { error } = await admin
    .from("prompt_configs")
    .update({
      content,
      version: (current?.version ?? 0) + 1,
      updated_by: callerEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { error: true, message: error.message }

  // The worker reloads within its cache TTL — no restart needed.
  revalidatePath("/prompts")
  return { error: false, message: "Prompt updated." }
}

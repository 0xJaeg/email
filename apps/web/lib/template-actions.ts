"use server"

import { revalidatePath } from "next/cache"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import type { ServerClient } from "@workspace/db/client"

type Result = { error: boolean; message: string }

// Authorize: only an admin may mutate templates (the real security boundary).
async function requireAdmin(): Promise<
  { ok: true; admin: ServerClient; email: string } | { ok: false }
> {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (caller?.role !== "admin") return { ok: false }
  return { ok: true, admin, email: user.email ?? "" }
}

function parse(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim(),
    content: String(formData.get("content") ?? "").trim(),
    is_active: formData.get("is_active") != null,
  }
}

function validate(t: ReturnType<typeof parse>): string | null {
  if (!t.name) return "Name is required."
  if (!t.title) return "Title is required."
  if (!t.content) return "Content is required."
  return null
}

export async function createTemplate(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const t = parse(formData)
  const invalid = validate(t)
  if (invalid) return { error: true, message: invalid }

  const { error } = await auth.admin
    .from("prompt_templates")
    .insert({ ...t, updated_by: auth.email })
  if (error) {
    if (error.code === "23505")
      return {
        error: true,
        message: "A template with that name already exists.",
      }
    return { error: true, message: error.message }
  }
  revalidatePath("/templates")
  return { error: false, message: "Template created." }
}

export async function updateTemplate(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const id = String(formData.get("id") ?? "")
  if (!id) return { error: true, message: "Missing template id." }
  const t = parse(formData)
  const invalid = validate(t)
  if (invalid) return { error: true, message: invalid }

  const { error } = await auth.admin
    .from("prompt_templates")
    .update({ ...t, updated_by: auth.email, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) {
    if (error.code === "23505")
      return {
        error: true,
        message: "A template with that name already exists.",
      }
    return { error: true, message: error.message }
  }
  revalidatePath("/templates")
  return { error: false, message: "Template updated." }
}

export async function deleteTemplate(id: string): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }

  const { error } = await auth.admin
    .from("prompt_templates")
    .delete()
    .eq("id", id)
  if (error) return { error: true, message: error.message }
  revalidatePath("/templates")
  return { error: false, message: "Template deleted." }
}

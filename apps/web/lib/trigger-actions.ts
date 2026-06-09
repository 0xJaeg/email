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
  return {
    product_id: String(formData.get("product_id") ?? ""),
    after_n_requests: Number(formData.get("after_n_requests")),
    is_active: String(formData.get("is_active") ?? "active") === "active",
  }
}

function validate(p: ReturnType<typeof parse>): string | null {
  if (!p.product_id) return "Product is required."
  if (!Number.isInteger(p.after_n_requests) || p.after_n_requests < 1)
    return "Threshold must be a whole number ≥ 1."
  return null
}

export async function createTrigger(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const p = parse(formData)
  const invalid = validate(p)
  if (invalid) return { error: true, message: invalid }

  const { error } = await auth.admin.from("action_triggers").insert({
    product_id: p.product_id,
    name: "Refund threshold",
    action: "issue_refund",
    condition: { after_n_requests: p.after_n_requests },
    is_active: p.is_active,
  })
  if (error) return { error: true, message: error.message }
  revalidatePath("/triggers")
  return { error: false, message: "Trigger created." }
}

export async function updateTrigger(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const id = String(formData.get("id") ?? "")
  if (!id) return { error: true, message: "Missing trigger id." }
  const p = parse(formData)
  const invalid = validate(p)
  if (invalid) return { error: true, message: invalid }

  const { error } = await auth.admin
    .from("action_triggers")
    .update({
      product_id: p.product_id,
      condition: { after_n_requests: p.after_n_requests },
      is_active: p.is_active,
    })
    .eq("id", id)
  if (error) return { error: true, message: error.message }
  revalidatePath("/triggers")
  return { error: false, message: "Trigger updated." }
}

export async function deleteTrigger(id: string): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const { error } = await auth.admin
    .from("action_triggers")
    .delete()
    .eq("id", id)
  if (error) return { error: true, message: error.message }
  revalidatePath("/triggers")
  return { error: false, message: "Trigger deleted." }
}

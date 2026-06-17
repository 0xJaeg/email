"use server"

import { revalidatePath } from "next/cache"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import type { ServerClient } from "@workspace/db/client"

type Result = { error: boolean; message: string }

// Authorize: only an admin may edit the flow. Server actions are independently
// invokable endpoints, so this is the real security boundary (not the page gate).
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

export async function updateFlowStepPrompt(
  formData: FormData
): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }

  const id = String(formData.get("id") ?? "")
  const raw = String(formData.get("ai_prompt") ?? "")
  if (!id) return { error: true, message: "Missing step id." }

  // Empty = clear the override and fall back to the global prompt.
  const ai_prompt = raw.trim() ? raw : null

  const { error } = await auth.admin
    .from("flow_steps")
    .update({ ai_prompt, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: true, message: error.message }

  // The worker reloads within its cache TTL — no restart needed.
  revalidatePath("/flows")
  return { error: false, message: "Step updated." }
}

// Edit a node's inline AI prompt (the decision tree the worker now runs). Empty
// clears the override so the node falls back to the shared prompt at /prompts.
export async function updateFlowNodePrompt(
  formData: FormData
): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }

  const id = String(formData.get("id") ?? "")
  const raw = String(formData.get("ai_prompt") ?? "")
  if (!id) return { error: true, message: "Missing node id." }

  const ai_prompt = raw.trim() ? raw : null

  const { error } = await auth.admin
    .from("flow_nodes")
    .update({ ai_prompt, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: true, message: error.message }

  revalidatePath("/flows")
  return { error: false, message: "Node updated." }
}

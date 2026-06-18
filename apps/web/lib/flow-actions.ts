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

// Edit a node's inline AI prompt (the decision tree the worker runs). Empty
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

export type CategoryInput = {
  key: string
  label: string
  description: string
  target_node_id: string
}

// Edit a classify node's categories + the branch each routes to. Atomic via the
// set_classify_categories RPC (keeps the classifier enum and the routing edges
// in sync). Validates before writing so a bad key can never reach the DB.
export async function updateClassifyCategories(
  nodeId: string,
  categories: CategoryInput[]
): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  if (!nodeId) return { error: true, message: "Missing node id." }
  if (categories.length === 0)
    return { error: true, message: "Add at least one category." }

  const seen = new Set<string>()
  for (const c of categories) {
    const key = c.key.trim()
    if (!/^[a-z0-9_]+$/.test(key))
      return {
        error: true,
        message: `Invalid key "${c.key}" — lowercase letters, numbers and underscores only.`,
      }
    if (seen.has(key))
      return { error: true, message: `Duplicate category key "${key}".` }
    seen.add(key)
    if (!c.label.trim())
      return { error: true, message: `Category "${key}" needs a label.` }
    if (!c.target_node_id)
      return { error: true, message: `Category "${key}" needs a target step.` }
  }

  const payload = categories.map((c) => ({
    key: c.key.trim(),
    label: c.label.trim(),
    description: c.description.trim(),
    target_node_id: c.target_node_id,
  }))

  const { error } = await auth.admin.rpc("set_classify_categories", {
    p_node_id: nodeId,
    p_categories: payload,
  })
  if (error) return { error: true, message: error.message }

  revalidatePath("/flows")
  return { error: false, message: "Categories saved." }
}

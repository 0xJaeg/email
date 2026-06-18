"use server"

import { revalidatePath } from "next/cache"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import type { ServerClient } from "@workspace/db/client"

const PLATFORMS = ["clickbank", "jvzoo"] as const
const ADAPTER_KEYS = ["mock", "clickbank", "jvzoo"] as const
type Platform = (typeof PLATFORMS)[number]
type AdapterKey = (typeof ADAPTER_KEYS)[number]

type Result = { error: boolean; message: string }

// Authorize: only an admin may mutate products (the real security boundary).
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

// Real per-product support facts the reply model is allowed to cite. Empty
// fields are omitted so the agent never sees (and never invents) a blank URL.
const SUPPORT_FIELDS: [string, string][] = [
  ["platform", "support_platform"],
  ["login_url", "login_url"],
  ["reset_url", "reset_url"],
  ["dashboard_url", "dashboard_url"],
  ["notes", "support_notes"],
  ["access_product_key", "access_product_key"],
]

function buildSupportConfig(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, field] of SUPPORT_FIELDS) {
    const v = String(formData.get(field) ?? "").trim()
    if (v) out[key] = v
  }
  return out
}

// Blank → null (use the built-in default); otherwise the parsed number.
function parseThreshold(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim()
  return s === "" ? null : Number(s)
}

function parse(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "")
      .trim()
      .toLowerCase(),
    platform: String(formData.get("platform") ?? ""),
    adapter_key: String(formData.get("adapter_key") ?? ""),
    is_active: String(formData.get("is_active") ?? "active") === "active",
    support_config: buildSupportConfig(formData),
    refund_threshold: parseThreshold(formData.get("refund_threshold")),
  }
}

function validate(p: ReturnType<typeof parse>): string | null {
  if (!p.name) return "Name is required."
  if (!/^[a-z0-9-]+$/.test(p.slug))
    return "Slug must be lowercase letters, numbers, and hyphens."
  if (!PLATFORMS.includes(p.platform as Platform)) return "Invalid platform."
  if (!ADAPTER_KEYS.includes(p.adapter_key as AdapterKey))
    return "Invalid adapter."
  for (const k of ["login_url", "reset_url", "dashboard_url"] as const) {
    const v = p.support_config[k]
    if (v && !/^https?:\/\/\S+$/i.test(v))
      return `${k.replace("_", " ")} must be a full URL (http/https).`
  }
  if (
    p.refund_threshold !== null &&
    (!Number.isInteger(p.refund_threshold) || p.refund_threshold < 1)
  )
    return "Refund threshold must be a whole number ≥ 1, or blank for the default (3)."
  return null
}

export async function createProduct(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const p = parse(formData)
  const invalid = validate(p)
  if (invalid) return { error: true, message: invalid }

  const { error } = await auth.admin.from("products").insert(p)
  if (error) {
    if (error.code === "23505")
      return {
        error: true,
        message: "A product with that slug already exists.",
      }
    return { error: true, message: error.message }
  }
  revalidatePath("/products")
  return { error: false, message: "Product created." }
}

export async function updateProduct(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const id = String(formData.get("id") ?? "")
  if (!id) return { error: true, message: "Missing product id." }
  const p = parse(formData)
  const invalid = validate(p)
  if (invalid) return { error: true, message: invalid }

  const { error } = await auth.admin.from("products").update(p).eq("id", id)
  if (error) {
    if (error.code === "23505")
      return {
        error: true,
        message: "A product with that slug already exists.",
      }
    return { error: true, message: error.message }
  }
  revalidatePath("/products")
  revalidatePath("/products/[id]", "page")
  return { error: false, message: "Product updated." }
}

export async function deleteProduct(id: string): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const { admin } = auth

  // The default product is the webhook's fallback for unrecognized inboxes.
  const { data: target } = await admin
    .from("products")
    .select("slug")
    .eq("id", id)
    .single()
  if (target?.slug === "default")
    return {
      error: true,
      message:
        "The default product can't be deleted (it's the webhook fallback).",
    }

  const { error } = await admin.from("products").delete().eq("id", id)
  if (error) return { error: true, message: error.message }
  revalidatePath("/products")
  return { error: false, message: "Product deleted." }
}

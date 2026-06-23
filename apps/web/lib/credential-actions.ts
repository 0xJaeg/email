"use server"

import { revalidatePath } from "next/cache"
import { encryptSecret } from "@workspace/actions/crypto"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import type { ServerClient } from "@workspace/db/client"

type Platform = "clickbank" | "jvzoo" | "digistore"
type Scope = "view" | "refund"

type Result = { error: boolean; message: string }

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

// The product form posts one optional secret per (platform, scope) slot.
const KEY_SLOTS: { field: string; platform: Platform; scope: Scope }[] = [
  { field: "key_clickbank_view", platform: "clickbank", scope: "view" },
  { field: "key_clickbank_refund", platform: "clickbank", scope: "refund" },
  { field: "key_jvzoo_view", platform: "jvzoo", scope: "view" },
  { field: "key_jvzoo_refund", platform: "jvzoo", scope: "refund" },
  { field: "key_digistore_view", platform: "digistore", scope: "view" },
  { field: "key_digistore_refund", platform: "digistore", scope: "refund" },
]

// Save the per-product view/edit API keys from the product editor. Each slot is
// optional: a BLANK value leaves the existing key untouched (the form never
// echoes the secret back, so blank = "no change"); a non-blank value encrypts +
// upserts that (product, platform, scope) row. Upsert relies on the unique index
// integration_credentials_product_platform_scope_idx.
export async function setProductKeys(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }

  const product_id = String(formData.get("id") ?? "")
  if (!product_id) return { error: true, message: "Product is required." }

  let encryptionBroken = false
  const rows = KEY_SLOTS.map((slot) => {
    const secret = String(formData.get(slot.field) ?? "").trim()
    if (!secret) return null
    let ciphertext: string
    try {
      ciphertext = encryptSecret(secret)
    } catch {
      encryptionBroken = true
      return null
    }
    return {
      product_id,
      platform: slot.platform,
      scope: slot.scope,
      platform_order: 0,
      label: `${slot.platform} ${slot.scope} key`,
      ciphertext,
      last4: secret.slice(-4),
      created_by: auth.callerEmail,
    }
  }).filter((r): r is NonNullable<typeof r> => r !== null)

  if (encryptionBroken) {
    return {
      error: true,
      message: "Encryption isn't configured — set CREDENTIALS_ENC_KEY.",
    }
  }
  if (rows.length === 0) return { error: false, message: "No key changes." }

  const { error } = await auth.admin
    .from("integration_credentials")
    .upsert(rows, { onConflict: "product_id,platform,scope" })
  if (error) return { error: true, message: error.message }
  revalidatePath("/products/[id]", "page")
  return { error: false, message: "API keys saved." }
}

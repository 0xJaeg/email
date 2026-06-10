"use server"

import { revalidatePath } from "next/cache"
import { encryptSecret } from "@workspace/actions/crypto"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import type { ServerClient } from "@workspace/db/client"

const PLATFORMS = ["clickbank", "jvzoo"] as const
type Platform = (typeof PLATFORMS)[number]

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

export async function createCredential(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }

  const product_id = String(formData.get("product_id") ?? "")
  const platform = String(formData.get("platform") ?? "")
  const label = String(formData.get("label") ?? "").trim()
  const secret = String(formData.get("secret") ?? "")
  if (!product_id) return { error: true, message: "Product is required." }
  if (!PLATFORMS.includes(platform as Platform))
    return { error: true, message: "Invalid platform." }
  if (!label) return { error: true, message: "Label is required." }
  if (!secret) return { error: true, message: "Secret is required." }

  let ciphertext: string
  try {
    ciphertext = encryptSecret(secret)
  } catch {
    return {
      error: true,
      message: "Encryption isn't configured — set CREDENTIALS_ENC_KEY.",
    }
  }

  const { error } = await auth.admin.from("integration_credentials").insert({
    product_id,
    platform,
    label,
    ciphertext,
    last4: secret.slice(-4),
    created_by: auth.callerEmail,
  })
  if (error) return { error: true, message: error.message }
  revalidatePath("/credentials")
  return { error: false, message: "Credential saved." }
}

export async function deleteCredential(id: string): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const { error } = await auth.admin
    .from("integration_credentials")
    .delete()
    .eq("id", id)
  if (error) return { error: true, message: error.message }
  revalidatePath("/credentials")
  return { error: false, message: "Credential deleted." }
}

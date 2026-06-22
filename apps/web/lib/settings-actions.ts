"use server"

import { revalidatePath } from "next/cache"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import { parseRecipients } from "@/lib/settings"
import type { ServerClient } from "@workspace/db/client"

type Result = { error: boolean; message: string }

// Authorize: only an admin may change global settings.
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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function updateRefundSettings(
  formData: FormData
): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const { admin } = auth
  const { user } = await getActionSupabase()

  // Blank or 0 → null (no cap); otherwise a whole number >= 1.
  const rawLimit = String(formData.get("refund_daily_limit") ?? "").trim()
  let limit: number | null = null
  if (rawLimit !== "") {
    const n = Number(rawLimit)
    if (!Number.isInteger(n) || n < 0) {
      return {
        error: true,
        message: "Daily limit must be a whole number (blank or 0 = no cap).",
      }
    }
    limit = n === 0 ? null : n
  }

  const recipients = parseRecipients(
    String(formData.get("refund_alert_recipients") ?? "")
  )
  const bad = recipients.filter((r) => !EMAIL_RE.test(r))
  if (bad.length) {
    return { error: true, message: `Invalid email(s): ${bad.join(", ")}` }
  }

  const { error } = await admin
    .from("app_settings")
    .update({
      refund_daily_limit: limit,
      refund_alert_recipients: recipients,
      updated_at: new Date().toISOString(),
      updated_by: user.email ?? user.id,
    })
    .eq("id", true)
  if (error) return { error: true, message: error.message }

  revalidatePath("/settings")
  revalidatePath("/")
  return { error: false, message: "Settings saved." }
}

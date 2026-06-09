"use server"

import { revalidatePath } from "next/cache"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import type { ServerClient } from "@workspace/db/client"

const ROLES = ["admin", "operator"] as const
type Role = (typeof ROLES)[number]

type Result = { error: boolean; message: string }

// Authorize: only an admin may mutate users. Server actions are independently
// invokable endpoints, so this is the real security boundary (not the page gate).
async function requireAdmin(): Promise<
  { ok: true; admin: ServerClient; callerId: string } | { ok: false }
> {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (caller?.role !== "admin") return { ok: false }
  return { ok: true, admin, callerId: user.id }
}

async function adminCount(admin: ServerClient): Promise<number> {
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
  return count ?? 0
}

export async function createUser(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const { admin } = auth

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const password = String(formData.get("password") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const role = String(formData.get("role") ?? "operator")

  if (!email.includes("@"))
    return { error: true, message: "A valid email is required." }
  if (password.length < 6)
    return { error: true, message: "Password must be at least 6 characters." }
  if (!ROLES.includes(role as Role))
    return { error: true, message: "Invalid role." }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    const msg = error?.message ?? ""
    if (msg.toLowerCase().includes("already"))
      return { error: true, message: "A user with that email already exists." }
    return { error: true, message: msg || "Could not create user." }
  }

  // The on_auth_user_created trigger already inserted a default 'operator'
  // profile for this auth user; upsert to set the chosen role/name.
  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: data.user.id,
      email,
      name: name || null,
      role,
    },
    { onConflict: "id" }
  )
  if (profileErr) return { error: true, message: profileErr.message }

  revalidatePath("/users")
  return { error: false, message: "User created." }
}

export async function updateUser(formData: FormData): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const { admin } = auth

  const id = String(formData.get("id") ?? "")
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const name = String(formData.get("name") ?? "").trim()
  const role = String(formData.get("role") ?? "operator")
  const password = String(formData.get("password") ?? "")

  if (!id) return { error: true, message: "Missing user id." }
  if (!email.includes("@"))
    return { error: true, message: "A valid email is required." }
  if (!ROLES.includes(role as Role))
    return { error: true, message: "Invalid role." }
  if (password && password.length < 6)
    return { error: true, message: "Password must be at least 6 characters." }

  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("role, email")
    .eq("id", id)
    .single()
  if (targetErr || !target)
    return { error: true, message: "User not found." }

  // Last-admin protection: don't demote the only remaining admin.
  if (target.role === "admin" && role === "operator") {
    if ((await adminCount(admin)) <= 1)
      return { error: true, message: "Can't demote the last admin." }
  }

  const emailChanged = email !== target.email
  if (emailChanged || password) {
    const { error: authErr } = await admin.auth.admin.updateUserById(id, {
      ...(emailChanged ? { email, email_confirm: true } : {}),
      ...(password ? { password } : {}),
    })
    if (authErr) {
      const msg = authErr.message ?? ""
      if (msg.toLowerCase().includes("already"))
        return { error: true, message: "That email is already in use." }
      return { error: true, message: msg || "Could not update credentials." }
    }
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ name: name || null, email, role })
    .eq("id", id)
  if (profileErr) return { error: true, message: profileErr.message }

  revalidatePath("/users")
  return { error: false, message: "User updated." }
}

export async function deleteUser(id: string): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: true, message: "Not authorized." }
  const { admin, callerId } = auth

  if (id === callerId)
    return { error: true, message: "You can't delete your own account." }

  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", id)
    .single()
  if (target?.role === "admin" && (await adminCount(admin)) <= 1)
    return { error: true, message: "Can't delete the last admin." }

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return { error: true, message: error.message }

  revalidatePath("/users")
  return { error: false, message: "User deleted." }
}

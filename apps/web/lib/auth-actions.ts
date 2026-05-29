"use server"

import { redirect } from "next/navigation"
import { getAnonActionSupabase } from "@/lib/supabase/server"

// Only allow same-origin relative paths as a post-login destination.
function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? "")
  if (next.startsWith("/") && !next.startsWith("//")) return next
  return "/"
}

export async function signIn(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const password = String(formData.get("password") ?? "")
  if (!email || !password) return { error: "Email and password are required." }

  const { supabase } = await getAnonActionSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: "Invalid email or password." }

  redirect(safeNext(formData.get("next")))
}

export async function signOut(): Promise<void> {
  // Anon client so an already-expired session still clears cleanly without a 500.
  const { supabase } = await getAnonActionSupabase()
  await supabase.auth.signOut()
  redirect("/login")
}

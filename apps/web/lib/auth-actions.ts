"use server"

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { getAnonActionSupabase } from "@/lib/supabase/server"

export async function signIn(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!email) return { error: "Email is required." }

  const headersList = await headers()
  const origin =
    headersList.get("x-forwarded-host")
      ? `${headersList.get("x-forwarded-proto") ?? "https"}://${headersList.get("x-forwarded-host")}`
      : `http://${headersList.get("host") ?? "localhost:3000"}`

  const { supabase } = await getAnonActionSupabase()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })
  if (error) return { error: error.message }
  return { ok: true }
}

export async function signOut(): Promise<void> {
  // Anon client so an already-expired session still clears cleanly without a 500.
  const { supabase } = await getAnonActionSupabase()
  await supabase.auth.signOut()
  redirect("/login")
}

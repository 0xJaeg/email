"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@workspace/db/types"
import type { SupabaseClient } from "@supabase/supabase-js"

let cached: SupabaseClient<Database> | null = null

export function getBrowserSupabase(): SupabaseClient<Database> {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set"
    )
  }
  cached = createBrowserClient<Database>(url, publishableKey)
  return cached
}

"use client"
import { createBrowserClient, type BrowserClient } from "@workspace/db/browser"

// Browser Supabase client (publishable key, RLS-governed). Used for Realtime
// subscriptions. NEXT_PUBLIC_* vars are inlined into the client bundle at build.
let client: BrowserClient | undefined

export function getBrowserSupabase(): BrowserClient {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in env"
    )
  }
  client = createBrowserClient({ url, publishableKey })
  return client
}

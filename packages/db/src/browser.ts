import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./types.gen.js"

export type BrowserClient = SupabaseClient<Database>

// Browser-safe client: uses the publishable key, which is safe to ship to
// the client. Reads are governed by RLS policies (see migration 0003).
export function createBrowserClient(env: {
  url: string
  publishableKey: string
}): BrowserClient {
  return createClient<Database>(env.url, env.publishableKey, {
    auth: { persistSession: true },
  })
}

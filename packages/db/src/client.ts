import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./types.gen.js"

export type ServerClient = SupabaseClient<Database>

export function createServerClient(env: {
  url: string
  secretKey: string
}): ServerClient {
  return createClient<Database>(env.url, env.secretKey, {
    auth: { persistSession: false },
  })
}

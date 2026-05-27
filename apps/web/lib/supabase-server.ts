import "server-only"
import { createServerClient, type ServerClient } from "@workspace/db/client"

// Server-only Supabase client (secret key, bypasses RLS). The `server-only`
// import makes the build fail if this module is ever pulled into a client
// bundle — the secret key must never reach the browser.
let client: ServerClient | undefined

export function getServerSupabase(): ServerClient {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !secretKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in env"
    )
  }
  client = createServerClient({ url, secretKey })
  return client
}

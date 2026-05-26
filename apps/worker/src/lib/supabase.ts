import { createServerClient, type ServerClient } from "@workspace/db/client"

let client: ServerClient | undefined

export function getSupabase(): ServerClient {
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

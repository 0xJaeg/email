import "server-only"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@workspace/db/types"
import type { SupabaseClient, User } from "@supabase/supabase-js"

type CookieStore = Awaited<ReturnType<typeof cookies>>

function buildClient(cookieStore: CookieStore): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set"
    )
  }
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server Component context: setAll is a no-op; proxy.ts refreshes cookies.
        }
      },
    },
  })
}

// Used by authenticated server actions (post-proxy guard).
export async function getActionSupabase(): Promise<{
  supabase: SupabaseClient<Database>
  user: User
}> {
  const cookieStore = await cookies()
  const supabase = buildClient(cookieStore)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error("not authenticated")
  return { supabase, user }
}

// Used by sign-in flows where there is no user yet.
export async function getAnonActionSupabase(): Promise<{
  supabase: SupabaseClient<Database>
}> {
  const cookieStore = await cookies()
  return { supabase: buildClient(cookieStore) }
}

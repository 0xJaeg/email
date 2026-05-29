import { NextResponse, type NextRequest } from "next/server"
import type { ProxyConfig } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { getServerSupabase } from "@/lib/supabase/admin"

export async function proxy(request: NextRequest): Promise<Response> {
  const { response, user } = await updateSession(request)

  // Not signed in → /login (preserve target via ?next=).
  if (!user) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  // Signed in → check profile (allow-list gate).
  // Uses the secret-key admin client because the proxy is server-only and the
  // session-scoped client cannot read `profiles` for other users (RLS).
  const supabase = getServerSupabase()
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile) {
    const url = new URL("/no-access", request.url)
    return NextResponse.redirect(url)
  }

  return response
}

export const config: ProxyConfig = {
  matcher: [
    // Match everything except: static files, image optimization, the favicon,
    // and the unauthenticated pages themselves.
    "/((?!_next/static|_next/image|favicon.ico|login|no-access).*)",
  ],
}

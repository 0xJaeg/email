# Slice G — Auth + Auth-Scoped RLS + Tier-0 Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's `anon`-RLS placeholder + hardcoded `APPROVER` with real Supabase Auth (magic-link sign-in), a `profiles` allow-list with a `role` column, and a Next.js 16 `proxy.ts` route guard. Switch the file layout under `apps/web/lib/supabase/` to the official Supabase docs convention. Fold in three Tier-0 cleanups: `AGENT_MAIL_INBOX_ID` doc-note, `packages/actions` build-step removal via Turbopack `experimental.extensionAlias`, and a `CLAUDE.md` route-doc fix.

**Architecture:** Doorman — `apps/web/proxy.ts` validates session + profile per request (via `@supabase/ssr.createServerClient(cookies)` + `getUser()`); SSR `page.tsx` reads stay on the secret-key client (unchanged); session-scoped client lives only inside the proxy and inside server actions so they can attribute `approved_by` to the real user email. Replace permissive `anon` SELECT policies with `authenticated` SELECT on `threads` / `emails` / `decisions` / `audit_log`. Profile-based gate (FK to `auth.users.id`).

**Tech Stack:** TypeScript (NodeNext for backend, Bundler for Next.js), Vitest, Supabase (Postgres + Auth + Realtime), `@supabase/ssr` (new), `@supabase/supabase-js` (existing), Next.js 16 App Router on `apps/web`, BullMQ on `apps/worker`, Hono on `apps/api`.

**Reference spec:** `docs/superpowers/specs/2026-05-28-slice-g-auth-rls-design.md` (commit `2dccaaf`).

---

## File structure

**Created:**
- `apps/web/proxy.ts` — Next.js 16 route guard.
- `apps/web/lib/supabase/admin.ts` — service-role client (was `lib/supabase-server.ts`).
- `apps/web/lib/supabase/client.ts` — browser session-aware client (was `lib/supabase-browser.ts`; now uses `@supabase/ssr.createBrowserClient`).
- `apps/web/lib/supabase/server.ts` — session-scoped server client (exports `getActionSupabase` + `getAnonActionSupabase`).
- `apps/web/lib/supabase/middleware.ts` — `updateSession(request)` helper.
- `apps/web/lib/supabase/__tests__/server.test.ts` — Vitest unit tests for the action helpers.
- `apps/web/lib/auth-actions.ts` — `signIn(formData)` + `signOut()` server actions.
- `apps/web/app/login/page.tsx` — magic-link request form.
- `apps/web/app/auth/callback/route.ts` — magic-link return handler.
- `apps/web/app/no-access/page.tsx` — signed-in-but-no-profile screen.
- `packages/db/supabase/migrations/20260528000002_profiles_and_auth_rls.sql` — profiles + RLS swap.
- `.env.example` (repo root) — variable list including `AGENT_MAIL_INBOX_ID`.

**Modified:**
- `apps/web/package.json` — add `@supabase/ssr`.
- `apps/web/next.config.mjs` — `experimental.extensionAlias` (Tier-0).
- `apps/web/app/(overview)/layout.tsx` — fetch user + profile, pass to `AppSidebar`.
- `apps/web/components/app-sidebar.tsx` — accept user prop.
- `apps/web/components/nav-user.tsx` — render real user; sign-out menu item; drop the 4 pre-existing unused imports.
- `apps/web/lib/approvals.ts` — drop `APPROVER` hardcode; read `user.email` from `getActionSupabase`.
- `packages/db/src/types.gen.ts` — regenerated for the new `profiles` table.
- `packages/actions/package.json` — drop `build` / `tsconfig.build.json` / conditional exports if `experimental.extensionAlias` works (Tier-0).
- `packages/actions/tsconfig.build.json` — **deleted** if Tier-0 succeeds.
- `CLAUDE.md` — route doc fix; Vitest already-documented; mark slice G shipped.
- `docs/initial-plan.md` Current status — mark slice G shipped (final task).

**Deleted (atomically with their replacements):**
- `apps/web/lib/supabase-server.ts` — replaced by `lib/supabase/admin.ts` in T2.
- `apps/web/lib/supabase-browser.ts` — replaced by `lib/supabase/client.ts` in T3.

---

## Task 1: Install `@supabase/ssr` + `profiles` migration + RLS swap

**Files:**
- Modify: `apps/web/package.json`
- Create: `packages/db/supabase/migrations/20260528000002_profiles_and_auth_rls.sql`
- Modify: `packages/db/src/types.gen.ts` (regenerated)

- [ ] **Step 1.1: Install `@supabase/ssr`**

```bash
pnpm --filter web add @supabase/ssr
```

Expected: `@supabase/ssr` lands in `apps/web/package.json` dependencies; pnpm-lock updates.

- [ ] **Step 1.2: Write the migration**

Use today's date with a `000002` suffix (sorts after slice E's `20260528000001_decisions_approval_state.sql`).

Create `packages/db/supabase/migrations/20260528000002_profiles_and_auth_rls.sql`:

```sql
-- Profiles table — allow-list for dashboard access, with role for future RBAC.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'operator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_idx on profiles (email);

-- A user can read their own profile (used by the proxy to check membership).
alter table profiles enable row level security;
create policy "users read own profile" on profiles
  for select to authenticated using (auth.uid() = id);

-- Replace permissive anon SELECT with authenticated SELECT on the four core tables.
drop policy "anon read threads"   on threads;
drop policy "anon read emails"    on emails;
drop policy "anon read decisions" on decisions;
drop policy "anon read audit_log" on audit_log;

create policy "authenticated read threads"   on threads   for select to authenticated using (true);
create policy "authenticated read emails"    on emails    for select to authenticated using (true);
create policy "authenticated read decisions" on decisions for select to authenticated using (true);
create policy "authenticated read audit_log" on audit_log for select to authenticated using (true);
```

- [ ] **Step 1.3: Apply migration**

From `packages/db/` (Supabase CLI workflow per the slice E T2 note):

```bash
cd packages/db && supabase db push
```

Verify via REST (replace with actual repo path of `.env.local`):

```bash
set -a; . /Users/christianjheggfermilan/Desktop/unearth/email/.env.local 2>/dev/null; set +a
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/profiles?select=*&limit=1" | jq
# Expected: [] (table exists, empty)

# Confirm anon read is now blocked (it used to return rows):
curl -s -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/decisions?select=id&limit=1" | jq
# Expected: [] or an RLS-denied response
```

- [ ] **Step 1.4: Regenerate types**

```bash
cd packages/db && supabase gen types typescript --project-id <project-ref> > src/types.gen.ts
```

(If `pnpm --filter @workspace/db gen-types` fails with the config.toml issue noted in slice E T2, use the direct command above; the implementer should look up `<project-ref>` from `.env.local`'s `NEXT_PUBLIC_SUPABASE_URL`.)

- [ ] **Step 1.5: Commit**

From repo root:

```bash
git add apps/web/package.json pnpm-lock.yaml \
  packages/db/supabase/migrations/20260528000002_profiles_and_auth_rls.sql \
  packages/db/src/types.gen.ts
git commit -m "Add profiles table + auth-scoped RLS; install @supabase/ssr"
```

---

## Task 2: Move `lib/supabase-server.ts` → `lib/supabase/admin.ts`

Atomic refactor: create new file, update all importers, delete old file — one commit, no half-state.

**Files:**
- Create: `apps/web/lib/supabase/admin.ts`
- Modify: every importer of `@/lib/supabase-server`
- Delete: `apps/web/lib/supabase-server.ts`

- [ ] **Step 2.1: Find all importers**

```bash
cd /Users/christianjheggfermilan/Desktop/unearth/email
grep -rln "lib/supabase-server" apps/web/ --include="*.ts" --include="*.tsx"
```

Expected output (from slice E + F state): `apps/web/lib/tickets.ts`, `apps/web/lib/decisions.ts`, `apps/web/lib/approvals.ts`, `apps/web/app/(overview)/page.tsx`, `apps/web/app/(overview)/activity/page.tsx`, `apps/web/app/(overview)/approvals/page.tsx`, plus possibly others. Sanity-check the list before bulk editing.

- [ ] **Step 2.2: Create `apps/web/lib/supabase/admin.ts`**

Copy the EXACT content of `apps/web/lib/supabase-server.ts` to the new path. The file should look like (verify against the actual current content first):

```ts
import "server-only"
import { createServerClient, type ServerClient } from "@workspace/db/client"

let cached: ServerClient | null = null

export function getServerSupabase(): ServerClient {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !secretKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY is not set")
  }
  cached = createServerClient({ url, secretKey })
  return cached
}
```

(If the existing file differs, preserve that content verbatim — this task is a rename, not a rewrite.)

- [ ] **Step 2.3: Update every importer**

For each file from Step 2.1, replace:

```ts
import { getServerSupabase } from "@/lib/supabase-server"
```

with:

```ts
import { getServerSupabase } from "@/lib/supabase/admin"
```

The exported symbol name (`getServerSupabase`) stays the same — only the import path changes.

- [ ] **Step 2.4: Delete the old file**

```bash
rm apps/web/lib/supabase-server.ts
```

- [ ] **Step 2.5: Verify**

```bash
pnpm --filter web typecheck
```

Expected: exit 0.

```bash
grep -rln "lib/supabase-server" apps/web/ --include="*.ts" --include="*.tsx"
```

Expected: no matches (empty output).

- [ ] **Step 2.6: Commit**

```bash
git add apps/web/lib/supabase/admin.ts apps/web/lib/supabase-server.ts apps/web/lib/ apps/web/app/
git commit -m "Move lib/supabase-server.ts → lib/supabase/admin.ts"
```

---

## Task 3: Move `lib/supabase-browser.ts` → `lib/supabase/client.ts` with `@supabase/ssr.createBrowserClient`

Atomic refactor + replace `@workspace/db/browser` with `@supabase/ssr.createBrowserClient` so the browser carries cookie sessions.

**Files:**
- Create: `apps/web/lib/supabase/client.ts`
- Modify: every importer of `@/lib/supabase-browser`
- Delete: `apps/web/lib/supabase-browser.ts`

- [ ] **Step 3.1: Find all importers**

```bash
grep -rln "lib/supabase-browser" apps/web/ --include="*.ts" --include="*.tsx"
```

Expected: `apps/web/components/tickets-table.tsx`, `apps/web/components/activity-log.tsx`, `apps/web/components/section-cards.tsx`. (Plus possibly others — verify.)

- [ ] **Step 3.2: Create `apps/web/lib/supabase/client.ts`**

```ts
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
    throw new Error("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set")
  }
  cached = createBrowserClient<Database>(url, publishableKey)
  return cached
}
```

Note the function name `getBrowserSupabase` matches the existing export — importers don't need to rename.

- [ ] **Step 3.3: Update every importer**

For each file from Step 3.1, replace:

```ts
import { getBrowserSupabase } from "@/lib/supabase-browser"
```

with:

```ts
import { getBrowserSupabase } from "@/lib/supabase/client"
```

- [ ] **Step 3.4: Delete the old file**

```bash
rm apps/web/lib/supabase-browser.ts
```

- [ ] **Step 3.5: Verify**

```bash
pnpm --filter web typecheck
```

Expected: exit 0.

```bash
grep -rln "lib/supabase-browser" apps/web/ --include="*.ts" --include="*.tsx"
```

Expected: empty.

- [ ] **Step 3.6: Commit**

```bash
git add apps/web/lib/supabase/client.ts apps/web/lib/supabase-browser.ts apps/web/components/
git commit -m "Move lib/supabase-browser.ts → lib/supabase/client.ts (using @supabase/ssr)"
```

---

## Task 4: Add `lib/supabase/server.ts` (`getActionSupabase` + `getAnonActionSupabase`) with Vitest tests (TDD)

**Files:**
- Create: `apps/web/lib/supabase/server.ts`
- Create: `apps/web/lib/supabase/__tests__/server.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `apps/web/lib/supabase/__tests__/server.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock next/headers cookies()
const mockGetAll = vi.fn().mockReturnValue([
  { name: "sb-test-auth-token", value: "abc" },
])
const mockSet = vi.fn()
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: mockGetAll, set: mockSet }),
}))

// Mock @supabase/ssr.createServerClient
const mockGetUser = vi.fn()
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}))

import { getActionSupabase, getAnonActionSupabase } from "../server.js"

describe("getActionSupabase", () => {
  beforeEach(() => {
    mockGetUser.mockReset()
  })

  it("returns { supabase, user } when authenticated", async () => {
    const user = { id: "u-1", email: "alice@example.com" }
    mockGetUser.mockResolvedValue({ data: { user }, error: null })
    const result = await getActionSupabase()
    expect(result.user).toEqual(user)
    expect(result.supabase).toBeDefined()
  })

  it("throws when no authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(getActionSupabase()).rejects.toThrow(/not authenticated/i)
  })

  it("throws when supabase.auth.getUser returns an error", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("network") })
    await expect(getActionSupabase()).rejects.toThrow()
  })
})

describe("getAnonActionSupabase", () => {
  it("returns supabase without requiring a user", async () => {
    const result = await getAnonActionSupabase()
    expect(result.supabase).toBeDefined()
  })
})
```

- [ ] **Step 4.2: Run test → expect FAIL**

```bash
pnpm --filter web test
```

Expected: FAIL with `Cannot find module '../server.js'`.

- [ ] **Step 4.3: Implement `lib/supabase/server.ts`**

```ts
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
    throw new Error("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set")
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
  const { data: { user }, error } = await supabase.auth.getUser()
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
```

- [ ] **Step 4.4: Run test → expect PASS**

```bash
pnpm --filter web test
```

Expected: 4 passed (3 for `getActionSupabase`, 1 for `getAnonActionSupabase`).

- [ ] **Step 4.5: Typecheck**

```bash
pnpm --filter web typecheck
```

Expected: exit 0.

- [ ] **Step 4.6: Commit**

```bash
git add apps/web/lib/supabase/server.ts apps/web/lib/supabase/__tests__/server.test.ts
git commit -m "Add session-scoped server client (getActionSupabase + getAnonActionSupabase)"
```

---

## Task 5: Add `lib/supabase/middleware.ts` (`updateSession` helper)

**Files:**
- Create: `apps/web/lib/supabase/middleware.ts`

- [ ] **Step 5.1: Implement `updateSession`**

```ts
import "server-only"
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { Database } from "@workspace/db/types"
import type { User } from "@supabase/supabase-js"

export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse
  user: User | null
}> {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set")
  }

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  // getUser() is verified (contacts the Auth server) — required for authz checks.
  const { data: { user } } = await supabase.auth.getUser()
  return { response, user }
}
```

- [ ] **Step 5.2: Typecheck**

```bash
pnpm --filter web typecheck
```

Expected: exit 0.

- [ ] **Step 5.3: Commit**

```bash
git add apps/web/lib/supabase/middleware.ts
git commit -m "Add updateSession middleware helper for @supabase/ssr cookies"
```

---

## Task 6: Add `apps/web/proxy.ts` (Next.js 16 route guard)

**Files:**
- Create: `apps/web/proxy.ts`

- [ ] **Step 6.1: Implement `proxy.ts`**

```ts
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
    "/((?!_next/static|_next/image|favicon.ico|login|auth/callback|no-access).*)",
  ],
}
```

- [ ] **Step 6.2: Typecheck**

```bash
pnpm --filter web typecheck
```

Expected: exit 0.

- [ ] **Step 6.3: Verify by visiting `/` (manual)**

Start dev (`pnpm dev` in background if not running). Open `http://localhost:3000/` in a fresh incognito window.

Expected: redirected to `/login?next=%2F` (or similar). The page won't render yet — `/login` doesn't exist (T7 adds it). The redirect is the verification that the proxy is gating correctly.

- [ ] **Step 6.4: Commit**

```bash
git add apps/web/proxy.ts
git commit -m "Add Next.js 16 proxy.ts route guard (auth + profile gate)"
```

---

## Task 7: Add `/login` page + `signIn` server action

**Files:**
- Create: `apps/web/app/login/page.tsx`
- Create: `apps/web/lib/auth-actions.ts`

- [ ] **Step 7.1: Implement the sign-in server action**

Create `apps/web/lib/auth-actions.ts`:

```ts
"use server"

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { getActionSupabase, getAnonActionSupabase } from "@/lib/supabase/server"

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
  const { supabase } = await getActionSupabase()
  await supabase.auth.signOut()
  redirect("/login")
}
```

- [ ] **Step 7.2: Implement the `/login` page**

Create `apps/web/app/login/page.tsx`:

```tsx
"use client"

import { useActionState } from "react"
import { signIn } from "@/lib/auth-actions"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

type State = { error?: string; ok?: boolean }

async function signInAction(_prev: State, formData: FormData): Promise<State> {
  return signIn(formData)
}

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<State, FormData>(signInAction, {})

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-muted-foreground text-sm">
          Enter your email — we'll send a magic link.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-3">
        <Input
          name="email"
          type="email"
          placeholder="you@company.com"
          required
          disabled={isPending}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Sending..." : "Send magic link"}
        </Button>
        {state.error && (
          <p className="text-destructive text-sm">{state.error}</p>
        )}
        {state.ok && (
          <p className="text-muted-foreground text-sm">
            Check your email for the sign-in link.
          </p>
        )}
      </form>
    </div>
  )
}
```

- [ ] **Step 7.3: Typecheck**

```bash
pnpm --filter web typecheck
```

Expected: exit 0.

- [ ] **Step 7.4: Verify by visiting `/login`**

Open `http://localhost:3000/login` — form should render. Submit your real ops email. Expect "Check your email" message; check inbox for the magic-link email.

(Do not click the magic link yet — `/auth/callback` doesn't exist until T8.)

- [ ] **Step 7.5: Commit**

```bash
git add apps/web/app/login/ apps/web/lib/auth-actions.ts
git commit -m "Add /login page with magic-link sign-in action"
```

---

## Task 8: Add `/auth/callback` route handler

**Files:**
- Create: `apps/web/app/auth/callback/route.ts`

- [ ] **Step 8.1: Implement the route handler**

```ts
import { NextResponse, type NextRequest } from "next/server"
import { getAnonActionSupabase } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const { supabase } = await getAnonActionSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
```

- [ ] **Step 8.2: Typecheck**

```bash
pnpm --filter web typecheck
```

Expected: exit 0.

- [ ] **Step 8.3: Verify the full sign-in round-trip**

1. Open `/login` in a fresh incognito window. Submit your email.
2. Click the magic link in your inbox.
3. Browser hits `/auth/callback?code=...` → exchanges code → redirects.
4. Expected: redirected to `/no-access` (you're signed in but no `profiles` row yet — that's correct; T9 adds the page UI but the redirect already works).

Or if a `profiles` row already exists for your email (e.g., admin pre-inserted it): redirected to `/`.

- [ ] **Step 8.4: Commit**

```bash
git add apps/web/app/auth/callback/route.ts
git commit -m "Add /auth/callback handler exchanging magic-link code for session"
```

---

## Task 9: Add `/no-access` page (sign-out) + clean up `nav-user.tsx`

**Files:**
- Create: `apps/web/app/no-access/page.tsx`
- Modify: `apps/web/components/nav-user.tsx` (clean up 4 unused imports while here; sign-out menu item lands in T10)

- [ ] **Step 9.1: Implement `/no-access`**

```tsx
import { signOut } from "@/lib/auth-actions"
import { Button } from "@workspace/ui/components/button"

export default function NoAccessPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">No access</h1>
      <p className="text-muted-foreground text-sm">
        You're signed in, but your account isn't on the ops team yet. Ask an
        admin to add you to the <code>profiles</code> table, then refresh.
      </p>
      <form action={signOut} className="mx-auto">
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 9.2: Drop the 4 unused imports in `nav-user.tsx`**

Read `apps/web/components/nav-user.tsx`. The 4 unused imports flagged by ESLint are:
- `DropdownMenuGroup` from `@workspace/ui/components/dropdown-menu`
- `IconUserCircle`, `IconCreditCard`, `IconNotification` from `@tabler/icons-react`

Remove these from the import statements. The file's actual JSX doesn't reference them.

- [ ] **Step 9.3: Typecheck + lint**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

Expected: both exit 0. The previous 4 lint warnings in `nav-user.tsx` should now be gone.

- [ ] **Step 9.4: Verify `/no-access` renders + sign-out works**

In the incognito session from T8, you should already be on `/no-access`. The "Sign out" button should work — click it; you should redirect to `/login`.

- [ ] **Step 9.5: Commit**

```bash
git add apps/web/app/no-access/page.tsx apps/web/components/nav-user.tsx
git commit -m "Add /no-access page; clean up nav-user.tsx unused imports"
```

---

## Task 10: Wire real user + profile into `(overview)/layout.tsx` + `AppSidebar` + `NavUser`

**Files:**
- Modify: `apps/web/app/(overview)/layout.tsx`
- Modify: `apps/web/components/app-sidebar.tsx`
- Modify: `apps/web/components/nav-user.tsx`

- [ ] **Step 10.1: Fetch user + profile in the layout**

Replace `apps/web/app/(overview)/layout.tsx` with:

```tsx
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export default async function OverviewLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Proxy already verified user + profile. Fetch them again for display.
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()
  const { data: profile } = await admin
    .from("profiles")
    .select("name, email, role")
    .eq("id", user.id)
    .single()

  const navUser = {
    name: profile?.name ?? user.email ?? "Operator",
    email: profile?.email ?? user.email ?? "",
    role: profile?.role ?? "operator",
  }

  return (
    <SidebarProvider
      style={{
        "--sidebar-width": "calc(var(--spacing) * 64)",
        "--header-height": "calc(var(--spacing) * 12)",
      } as React.CSSProperties}
    >
      <AppSidebar variant="inset" user={navUser} />
      <SidebarInset>
        <SiteHeader />
        <main className="flex-1 p-2 lg:p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

- [ ] **Step 10.2: Accept the `user` prop in `AppSidebar`**

Modify `apps/web/components/app-sidebar.tsx`. Remove the hardcoded `data.user` literal (the `{ name: "shadcn", email: "m@example.com", avatar: "/avatars/shadcn.jpg" }` block). Add a `user` prop and pass it to `<NavUser>`:

```tsx
"use client"

import type { ComponentProps } from "react"
// ...existing imports...

type NavUserData = {
  name: string
  email: string
  role: string
}

export function AppSidebar({
  user,
  ...props
}: ComponentProps<typeof Sidebar> & { user: NavUserData }) {
  // ...existing JSX, but replace data.user with user...
  return (
    <Sidebar collapsible="icon" {...props}>
      {/* ...existing header/content... */}
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
```

(Adapt to the existing structure of the file; the key change is removing the hardcoded `data.user` block and threading the prop through.)

- [ ] **Step 10.3: Render real user data + add sign-out in `NavUser`**

Modify `apps/web/components/nav-user.tsx`. Use the user prop already accepted; replace the avatar `src` reference with a fallback (no `/avatars/shadcn.jpg` anymore). Add a Sign-out menu item that submits the `signOut` server action.

```tsx
"use client"

import {
  Avatar,
  AvatarFallback,
} from "@workspace/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import { IconDotsVertical, IconLogout } from "@tabler/icons-react"
import { signOut } from "@/lib/auth-actions"

type Props = {
  user: { name: string; email: string; role: string }
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"
}

export function NavUser({ user }: Props) {
  const { isMobile } = useSidebar()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg grayscale">
                <AvatarFallback className="rounded-lg">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              </div>
              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <form action={signOut}>
                <button type="submit" className="flex w-full items-center gap-2">
                  <IconLogout className="size-4" />
                  Sign out
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
```

- [ ] **Step 10.4: Typecheck + lint**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

Expected: both exit 0.

- [ ] **Step 10.5: Bootstrap a profile + verify the full flow**

Insert a profile row for your test user (look up the `auth.users.id` first):

```bash
set -a; . /Users/christianjheggfermilan/Desktop/unearth/email/.env.local 2>/dev/null; set +a
# Find the auth.users.id for your email (replace YOUR_EMAIL)
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users" | jq '.users[] | {id, email}'

# Then insert the profile
curl -s -X POST -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"id":"<AUTH_USERS_ID>","email":"<YOUR_EMAIL>","name":"<YOUR_NAME>","role":"operator"}' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/profiles" | jq
```

Sign in via `/login` again (or refresh from `/no-access`). Expected: dashboard renders with your name + email + role visible in the sidebar; the sign-out button in the dropdown works.

- [ ] **Step 10.6: Commit**

```bash
git add apps/web/app/\(overview\)/layout.tsx apps/web/components/app-sidebar.tsx apps/web/components/nav-user.tsx
git commit -m "Wire real user + profile into layout + AppSidebar + NavUser"
```

---

## Task 11: Real `approved_by = user.email` in approveRefund / rejectRefund

**Files:**
- Modify: `apps/web/lib/approvals.ts`

- [ ] **Step 11.1: Replace `APPROVER` hardcode with session-derived email**

In `apps/web/lib/approvals.ts`:

1. Remove the `const APPROVER = "mvp-operator"` line.
2. Add an import: `import { getActionSupabase } from "@/lib/supabase/server"`.
3. At the top of both `approveRefund` and `rejectRefund`, call `const { user } = await getActionSupabase()`.
4. Replace all uses of `APPROVER` with `user.email ?? user.id` (fallback to id if email is somehow null — Supabase guarantees email present for OTP sign-ins, so the fallback is defensive only).

The conditional UPDATE pattern and the refund-first / notify-second ordering from slice E T12 are unchanged.

Example for `approveRefund` (showing only the changed lines around the `approved_by` write):

```ts
export async function approveRefund(decisionId: string): Promise<void> {
  const { user } = await getActionSupabase()
  const approvedBy = user.email ?? user.id
  const supabase = getServerSupabase()

  const { data: claimed, error: claimErr } = await supabase
    .from("decisions")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
    })
    .eq("id", decisionId)
    .eq("status", "pending_approval")
    .select(/* ...existing... */)
    .maybeSingle()
  // ...rest unchanged...
}
```

Same change for `rejectRefund`.

- [ ] **Step 11.2: Typecheck**

```bash
pnpm --filter web typecheck
```

Expected: exit 0.

- [ ] **Step 11.3: Browser verification**

With dev running and the proxy + profile in place from T10:

1. Drive a refund into `pending_approval` (e.g., `pnpm sim refund1; pnpm sim refund2; pnpm sim refund3` — refund3 hits the queue).
2. Open `/approvals` and click Approve on Alice's row.
3. Query the DB:

```bash
set -a; . /Users/christianjheggfermilan/Desktop/unearth/email/.env.local 2>/dev/null; set +a
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/decisions?select=approved_by,approved_at,emails(from_email)&decision=eq.issue_refund&order=created_at.desc&limit=1" | jq
```

Expected: `approved_by` is YOUR email (not `"mvp-operator"`); `approved_at` is recent.

- [ ] **Step 11.4: Commit**

```bash
git add apps/web/lib/approvals.ts
git commit -m "approveRefund + rejectRefund attribute approved_by to authenticated user"
```

---

## Task 12: Tier-0 — try `experimental.extensionAlias` to drop the `@workspace/actions` build step

**Files:**
- Modify: `apps/web/next.config.mjs`
- (Possibly) Modify: `packages/actions/package.json`
- (Possibly) Delete: `packages/actions/tsconfig.build.json`

- [ ] **Step 12.1: Add `experimental.extensionAlias`**

In `apps/web/next.config.mjs`, add to the config:

```js
const nextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/db", "@workspace/actions"],
  experimental: {
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
    },
  },
}
```

(`@workspace/actions` added to `transpilePackages` so Turbopack will transpile the source `.ts` files directly.)

- [ ] **Step 12.2: Simplify `packages/actions/package.json` exports**

In `packages/actions/package.json`, replace the conditional exports with direct `.ts` paths:

```json
"exports": {
  ".": "./src/index.ts",
  "./send-reply": "./src/sendReply.ts",
  "./refund-customer": "./src/refundCustomer.ts",
  "./agent-mail": "./src/agent-mail.ts",
  "./types": "./src/types.ts"
}
```

Remove the `"build"` script and the `tsconfig.build.json` reference.

- [ ] **Step 12.3: Delete the build config**

```bash
rm packages/actions/tsconfig.build.json
```

- [ ] **Step 12.4: Verify everything still works**

```bash
# Web typecheck + actions package typecheck
pnpm --filter web typecheck
pnpm --filter @workspace/actions typecheck

# Worker still imports from @workspace/actions — confirm it resolves
pnpm --filter worker typecheck
pnpm --filter worker test

# All unit tests
pnpm test
```

Expected: all exit 0; 4 tests pass.

Then start dev fresh:

```bash
pnpm dev  # in background; wait for "ready"
```

Open `/approvals` in the browser; confirm the page still loads and the Approve / Reject server actions work (server actions import from `@workspace/actions` subpaths — if extensionAlias didn't take, this is where it breaks).

- [ ] **Step 12.5: If Step 12.4 fails, ROLL BACK**

If web or worker typechecks fail, or the runtime breaks:

```bash
git checkout -- apps/web/next.config.mjs packages/actions/package.json
git checkout HEAD -- packages/actions/tsconfig.build.json
```

Report status `DONE_WITH_CONCERNS` noting the Tier-0 cleanup didn't work; leave the build chain as-is.

- [ ] **Step 12.6: Commit (only if Step 12.4 succeeded)**

```bash
git add apps/web/next.config.mjs packages/actions/package.json packages/actions/tsconfig.build.json pnpm-lock.yaml
git commit -m "Drop @workspace/actions build step (Turbopack experimental.extensionAlias)"
```

---

## Task 13: Tier-0 — CLAUDE.md route doc fix + `.env.example` + AGENT_MAIL_INBOX_ID note

**Files:**
- Modify: `CLAUDE.md`
- Create: `.env.example`

- [ ] **Step 13.1: Fix CLAUDE.md route docs**

Find the line that says `/dashboard` and `/dashboard/activity` in the Architecture section. Replace with the actual route paths: `/` (Dashboard), `/activity` (Action log), `/approvals` (Refund approval queue), `/login` (auth), `/no-access` (signed-in-but-no-profile), `/auth/callback` (magic-link return).

Adapt the existing prose to mention the new routes naturally; don't restructure other sections.

- [ ] **Step 13.2: Add the slice-G entries to the Current state paragraph**

In CLAUDE.md's `Current state:` paragraph, append a clause noting:

- New `apps/web/proxy.ts` (Next.js 16 route guard).
- New `apps/web/lib/supabase/` subdirectory (`client.ts` / `server.ts` / `admin.ts` / `middleware.ts`) following the official Supabase docs convention.
- New `profiles` table (FK to `auth.users.id`, with `email` + `role text default 'operator'`); RLS swapped from permissive `anon` SELECT to `authenticated` SELECT.
- `approveRefund` / `rejectRefund` now attribute `approved_by` to the real authenticated email.

Update the "**Auth is still not implemented**" line to "**Auth is implemented** — Supabase magic-link sign-in via `proxy.ts` + `profiles` allow-list; service-role SSR reads continue (doorman model)."

- [ ] **Step 13.3: Create `.env.example` at repo root**

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SECRET_KEY=<service-role-key>

# Redis (local docker compose)
REDIS_URL=redis://localhost:6379

# Anthropic
ANTHROPIC_API_KEY=<sk-ant-api03-...>

# Agent Mail
AGENT_MAIL_WEBHOOK_SECRET=<svix whsec_...>
AGENT_MAIL_API_KEY=<from AgentMail dashboard>
AGENT_MAIL_INBOX_ID=<from AgentMail dashboard — required for sendReply>

# Ports
PORT=3001
```

- [ ] **Step 13.4: Commit**

```bash
git add CLAUDE.md .env.example
git commit -m "Fix CLAUDE.md routes; add .env.example with AGENT_MAIL_INBOX_ID"
```

---

## Task 14: End-to-end verification + mark slice G shipped

This is the slice-G acceptance gate. Drive the real surface, capture observable evidence, mark shipped.

- [ ] **Step 14.1: Clean baseline (sim test data)**

```bash
set -a; . /Users/christianjheggfermilan/Desktop/unearth/email/.env.local 2>/dev/null; set +a
curl -s -X DELETE -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/threads?sender_email=ilike.*sim.local*"
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/emails?select=id&from_email=ilike.*sim.local*" | jq 'length'
```

Expected: 0.

- [ ] **Step 14.2: Sign-in flow regression**

Open `http://localhost:3000/` in a fresh incognito window. Expected sequence:

1. Hit `/` → redirected to `/login?next=%2F`.
2. Submit your real email → "Check your email" message.
3. Click the magic link → redirected back through `/auth/callback?code=...` to `/`.
4. Dashboard renders with your real name + email + role in the sidebar.

(If your profile was deleted between tests, you'll land on `/no-access` after step 3. Re-insert the profile row.)

- [ ] **Step 14.3: Approve a refund as the real user**

```bash
pnpm sim refund1
pnpm sim refund2
pnpm sim refund3
```

Wait ~15s. Then open `/approvals` and click Approve on Alice's `issue_refund` row.

Query:

```bash
set -a; . /Users/christianjheggfermilan/Desktop/unearth/email/.env.local 2>/dev/null; set +a
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/decisions?select=status,approved_by,approved_at,decision,emails(from_email)&decision=eq.issue_refund&order=created_at.desc&limit=1" | jq
```

Expected: `approved_by` is YOUR email. `approved_at` is now. `status` = `'sent'` (if `AGENT_MAIL_INBOX_ID` is set in `.env.local`) or `'failed'` (if not — the env-missing failure path from slice E carries over).

- [ ] **Step 14.4: RLS verification — anon read is now blocked**

```bash
set -a; . /Users/christianjheggfermilan/Desktop/unearth/email/.env.local 2>/dev/null; set +a
curl -s -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/decisions?select=id&limit=5" | jq
```

Expected: `[]` (anon role no longer has SELECT). Pre-slice-G this would have returned rows.

- [ ] **Step 14.5: Sign-out**

In the browser, open the nav-user dropdown and click Sign out. Expected: redirected to `/login`.

Visit `/` directly — should redirect back to `/login?next=%2F`.

- [ ] **Step 14.6: Final regression sweep**

```bash
cd /Users/christianjheggfermilan/Desktop/unearth/email
pnpm typecheck   # 6 workspaces, all exit 0
pnpm lint        # exit 0; pre-existing warnings can remain but no new ones
pnpm test        # all unit tests pass; should be 8 now (7 from slice E + 4 from slice G's server.test.ts = 11; verify count)
```

Expected: all green.

- [ ] **Step 14.7: Update `docs/initial-plan.md` Current status**

Move slice G from "Remaining" to "Built + verified end-to-end" with a sub-bullet:

- **G — Auth + auth-scoped RLS:** Supabase Auth magic-link sign-in (`/login` + `/auth/callback`); `profiles` allow-list with role column; Next.js 16 `proxy.ts` route guard (doorman model — secret-key SSR reads remain unchanged); RLS replaced permissive `anon` SELECT with `authenticated` SELECT on `threads` / `emails` / `decisions` / `audit_log`; `approveRefund` / `rejectRefund` write real `approved_by = user.email`. File layout moved to `apps/web/lib/supabase/` per official Supabase docs convention.

- [ ] **Step 14.8: Final commit**

```bash
git add docs/initial-plan.md
git commit -m "Mark slice G (auth + auth-scoped RLS) as shipped"
```

---

## Self-review checklist

Before handoff:

- **Spec coverage:** every section/requirement of the spec maps to a task.
  - Goal 1 (magic-link sign-in/out) → T7, T8, T9, T10.
  - Goal 2 (profile-based gate) → T1 (migration) + T6 (proxy gate).
  - Goal 3 (real `approved_by`) → T11.
  - Goal 4 (auth-scoped RLS) → T1.
  - Goal 5 (doorman architecture) → T6 keeps admin client; T4/T5 add session-scoped client; SSR pages still use admin (T2 preserves that path).
  - Goal 6 (Tier-0 prep) → T12 (extensionAlias) + T13 (CLAUDE.md + .env.example).
- **Placeholder scan:** no TBD / TODO / fill-in / "similar to" references.
- **Type consistency:** `getActionSupabase` returns `{ supabase, user }` across all uses (T4, T11, sign-out in T7). `getAnonActionSupabase` returns `{ supabase }` (T7, T8). `updateSession` returns `{ response, user }` (T5, T6). Function names stable across tasks.
- **Order:** install + schema → file moves → session helpers → proxy → auth pages → user wiring → real attribution → Tier-0 cleanup → verification. Each task builds on the previous.

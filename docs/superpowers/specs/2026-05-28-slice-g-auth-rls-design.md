# Slice G — Auth + auth-scoped RLS + Tier-0 prep (Design)

**Status:** Approved 2026-05-28 (brainstorming complete; pending implementation plan).
**Depends on:** Slices A (foundation), B (ingestion), C (classifier), D (refund decision tree), E (action layer + refund approval queue), F (dashboard) — all built and verified.

## Context

After slice E, the dashboard at `apps/web` is fully functional but **unauthenticated** — anyone with the URL + publishable key can read all support data, and refund approvals are attributed to a hardcoded `APPROVER = "mvp-operator"`. The current RLS (`migration 0003`) is a permissive `anon` SELECT — a stated MVP placeholder that the slice E final review flagged as a critical production blocker. Slice G replaces it with real auth.

Sign-in is via Supabase Auth **magic link** (email OTP). Access is gated by a `profiles` table acting as an allow-list with a future-friendly `role` column. The architecture is **doorman**: a Next.js 16 `proxy.ts` validates session + profile per request; SSR page queries continue to use the secret-key client (unchanged); session-scoped clients carry the user into server actions for real attribution.

Tier-0 prep from the gap-inventory plan folds in: a doc-note for `AGENT_MAIL_INBOX_ID`, a `packages/actions` dist-build cleanup attempt (Turbopack `experimental.extensionAlias`), and a `CLAUDE.md` route doc fix.

## Goals

1. **Magic-link sign-in / sign-out.** Operators sign in via email OTP; sessions persist (Supabase default ~1 week).
2. **Profile-based access gate.** `profiles` table (FK to `auth.users.id`, with `email` + `role text default 'operator'`) acts as an allow-list. Admin inserts profile rows in Supabase Studio to grant access.
3. **Real `approved_by` attribution.** `approveRefund` / `rejectRefund` write the authenticated user's email to `decisions.approved_by` (replacing the `'mvp-operator'` hardcode).
4. **Auth-scoped RLS.** Replace permissive `anon` SELECT policies with `authenticated`-role policies on `threads` / `emails` / `decisions` / `audit_log`.
5. **Doorman architecture.** `proxy.ts` is the single gate; SSR page queries continue on the secret-key client. Browser switches to `@supabase/ssr.createBrowserClient` for session-aware Realtime.
6. **Tier-0 prep folded in.** Document `AGENT_MAIL_INBOX_ID`; try `experimental.extensionAlias` to drop the `@workspace/actions` build step; fix stale `/dashboard` route paths in `CLAUDE.md`.

## Non-goals (this slice)

- **Multi-inbox scoping** — no `inbox_id` columns; no per-inbox routing. Schema is shaped to accommodate later (`profiles` can grow a join). Slice H or later.
- **Admin invite UI** — admin inserts profile rows via Supabase Studio SQL.
- **Per-table RLS using `profiles.role`** (e.g., "only admins can approve") — single-role MVP; `'operator'` is the only value used.
- **OAuth providers** — magic link only.
- **Disabling Supabase project sign-ups** — Studio toggle, out-of-band from this slice.
- **Session-scoped SSR everywhere** — doorman keeps SSR page reads on secret key.
- **Auth on `apps/api`** — the Hono webhook server stays on Svix signature verification (no user auth).
- **Real ClickBank, reply editing, reject reasons, notifications, manual retry** — Tier-2 polish in a later slice.

## Architecture

```
                                                ┌──> /login (magic-link form)
Browser ──no session──> proxy.ts ──redirect────┤
                          ↓                     └──> /no-access (signed in, no profile)
                          ↓ (session present + profile present)
                          ↓
                     getServerSupabase()  ← SSR queries (UNCHANGED — still secret key)
                          ↓
                     Server Components (page.tsx — /, /activity, /approvals)
                          ↓
                     Server actions (approveRefund / rejectRefund / signOut)
                          ↓
                     session-scoped client ── reads user.email from cookies via @supabase/ssr
                          ↓
                     decisions.approved_by = user.email
```

`@supabase/ssr` is added as a new dependency in `apps/web`. `getUser()` is used for verified-identity checks (NEVER `getSession()`, which Supabase docs flag as unverified).

## File layout

Follows the official Supabase Next.js convention — `lib/supabase/` subdirectory with separate concerns:

```
apps/web/lib/supabase/
  client.ts        # Browser, session-aware                   [was lib/supabase-browser.ts; now uses @supabase/ssr.createBrowserClient]
  server.ts        # Session-scoped server                    [NEW — @supabase/ssr.createServerClient(cookies); used by proxy.ts + server actions]
  admin.ts         # Service-role server (secret key)         [was lib/supabase-server.ts; signature unchanged; used by SSR pages]
  middleware.ts    # Session-refresh helper                   [NEW — wraps createServerClient(cookies) + getUser() + writes refreshed cookies back]
apps/web/proxy.ts  # Next.js 16 route guard (new file)        [imports lib/supabase/middleware.ts]
```

Each file move is **additive + delete-old in the same commit** so consumers never see a half-state:

1. Create `lib/supabase/admin.ts` with current `getServerSupabase()` content.
2. Update every importer of `@/lib/supabase-server` to `@/lib/supabase/admin`.
3. Delete `lib/supabase-server.ts`.
4. Same dance for `lib/supabase-browser.ts` → `lib/supabase/client.ts` (refactor to `@supabase/ssr.createBrowserClient`).
5. Add `server.ts`, `middleware.ts`, and `apps/web/proxy.ts`.

`packages/db/src/client.ts` and `packages/db/src/browser.ts` are **unchanged** — still used by `apps/worker` + `apps/api` for service-role access. `packages/db/src/browser.ts` may become unused by `apps/web` after this slice — flagged as a follow-up.

## Data model

New migration adds `profiles` and replaces the permissive `anon` policies:

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'operator',  -- enum-ish: 'operator' for MVP; more values future
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_idx on profiles (email);

-- Profile RLS: a user can read their own profile
alter table profiles enable row level security;
create policy "users read own profile" on profiles
  for select to authenticated using (auth.uid() = id);

-- Replace permissive anon SELECT with authenticated SELECT
drop policy "anon read threads"   on threads;
drop policy "anon read emails"    on emails;
drop policy "anon read decisions" on decisions;
drop policy "anon read audit_log" on audit_log;

create policy "authenticated read threads"   on threads   for select to authenticated using (true);
create policy "authenticated read emails"    on emails    for select to authenticated using (true);
create policy "authenticated read decisions" on decisions for select to authenticated using (true);
create policy "authenticated read audit_log" on audit_log for select to authenticated using (true);

-- supabase_realtime publication already includes the 4 tables (migration 0003); unchanged.
```

**Bootstrap workflow for new operators:**

1. User visits `/login`, types email, clicks magic link.
2. `auth.users` row created on first sign-in.
3. Dashboard redirects them to `/no-access` (signed in, no profile yet).
4. Admin opens Supabase Studio → finds their `auth.users.id` → `INSERT INTO profiles (id, email, role) VALUES (...)`.
5. User refreshes → access granted.

Two manual admin steps the first time per user. Future enhancement: an `/admin/profiles` UI (not in slice G).

## Data flow

### Sign-in (first time)

1. Hit protected route → `proxy.ts`'s `getUser()` returns null → redirect `/login`.
2. User types email; server action calls `auth.signInWithOtp({ email, options: { emailRedirectTo: '<origin>/auth/callback' } })`.
3. "Check your email" UI; user clicks magic link.
4. Browser hits `/auth/callback?code=...`; GET handler calls `auth.exchangeCodeForSession(code)` → cookies set → redirect to intended URL (or `/`).
5. `proxy.ts` runs again: user present, profile lookup returns nothing → redirect `/no-access`.
6. Admin inserts profile row.
7. User refreshes → access granted.

### Authenticated request (steady state)

1. Browser sends cookies → `proxy.ts` validates session (`getUser()` via session-scoped client) + profile (lookup by `auth.uid()`).
2. Server Component calls `getServerSupabase()` (service-role from `admin.ts` — unchanged) for page data.
3. Page renders.

### Server-action attribution (`approveRefund`)

1. Browser POSTs action with cookies → `proxy.ts` validates first.
2. Inside action: `const { supabase, user } = await getActionSupabase()` (session-scoped client + verified user).
3. Existing race-safe `UPDATE … WHERE status='pending_approval'` runs; `approved_by = user.email` (replaces `'mvp-operator'`).
4. Rest of approve flow unchanged (refundCustomer stub → sendReply → status transitions).

### Sign-out

Server action: `supabase.auth.signOut()` → cookies cleared → redirect `/login`.

## Action / helper contracts

```ts
// apps/web/lib/supabase/server.ts
export async function getActionSupabase(): Promise<{
  supabase: SupabaseClient<Database>  // session-scoped, cookies attached
  user: User                          // verified via auth.getUser()
}>
// Throws if no session (server action should not have been reachable past the proxy).
```

```ts
// apps/web/lib/supabase/middleware.ts
import type { NextRequest, NextResponse } from "next/server"

export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse
  user: User | null
}>
// Creates createServerClient(cookies), calls getUser(), writes refreshed cookies back.
// Called from apps/web/proxy.ts.
```

```ts
// apps/web/proxy.ts (Next.js 16 route guard)
import type { NextRequest } from "next/server"
import type { ProxyConfig } from "next/server"

export async function proxy(request: NextRequest): Promise<Response>
export const config: ProxyConfig = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|auth/callback|no-access).*)"],
}
// Skip the auth pages themselves; gate everything else.
```

## Error handling

| Failure | Handling |
|---|---|
| No session in `proxy.ts` | Redirect `/login` (preserve intended URL via `?next=<path>`). |
| Profile lookup DB hiccup | Log + redirect `/no-access?error=session_check_failed`. |
| `signInWithOtp` fails (rate limit, invalid email) | Show error in `/login` UI. |
| `exchangeCodeForSession` fails (expired/invalid code) | Redirect `/login?error=link_expired`. |
| Session expires mid-use | Next request's proxy catches null user → `/login`. |
| Profile revoked mid-session | Next request's proxy → `/no-access`. |
| Server action without session | `getActionSupabase` throws → action returns error. |
| Existing slice E patterns | Unchanged — race-safe conditional update, refund-first / notify-second, audit shapes. |

## Tier-0 prep folded in

1. **`AGENT_MAIL_INBOX_ID`** — operator action (paste from AgentMail dashboard into `.env.local`). Slice G adds an explicit doc-note (CLAUDE.md or `.env.example`) showing the var is required for the approve flow.
2. **`packages/actions` build cleanup** — try `experimental.extensionAlias: { '.js': ['.ts', '.tsx', '.js'] }` in `apps/web/next.config.mjs` so Turbopack reads `.ts` directly. If it works → remove the `build` script + `tsconfig.build.json` + conditional exports from `packages/actions/package.json`; re-test web + worker. If it doesn't → document the current build chain and move on (already documented in CLAUDE.md).
3. **CLAUDE.md route docs** — `/dashboard` → `/`, `/dashboard/activity` → `/activity`; add `/approvals`, `/login`, `/no-access`.

## Testing strategy

End-to-end via Playwright (where it pays off) + the existing sim harness:

| Scenario | Expected |
|---|---|
| Visit `/` without session | Redirect `/login` |
| Sign in via magic link, no profile yet | Land on `/no-access` |
| Admin INSERTs profile → refresh `/` | Dashboard renders |
| Approve a pending refund with sign-in established | `decisions.approved_by` = real email (not `'mvp-operator'`); audit captures it |
| `pnpm sim refund3` end-to-end after auth lives | Same outcomes as slice E T13 |
| Sign out → next page hit | Redirect `/login` |
| Browser query via publishable-key client **without** session | RLS blocks (empty/401) |
| Browser query via publishable-key client **with** session | Rows return (authenticated RLS passes) |

Vitest unit coverage where it pays off:

- `getActionSupabase` returns the right `{ supabase, user }` from mocked cookies.
- `approveRefund` writes `approved_by` from the session user (not the old hardcode).
- `proxy.ts` decision logic (no user → `/login`; user + profile → through; user + no profile → `/no-access`) with mocked Supabase responses.

Final sweep: `pnpm typecheck && pnpm lint && pnpm test`.

## Implementation order (sketch — detailed plan via `writing-plans`)

1. Add `@supabase/ssr` dependency to `apps/web`.
2. Schema migration: `profiles` table + RLS swap.
3. Create `apps/web/lib/supabase/admin.ts` (move from `lib/supabase-server.ts`); update importers; delete the old file.
4. Create `apps/web/lib/supabase/client.ts` (move from `lib/supabase-browser.ts`; refactor to `createBrowserClient`); update importers; delete old.
5. Add `apps/web/lib/supabase/server.ts` + `getActionSupabase`.
6. Add `apps/web/lib/supabase/middleware.ts` + `updateSession`.
7. Add `apps/web/proxy.ts`.
8. Add `/login` page (form + signInWithOtp server action).
9. Add `/auth/callback` route handler.
10. Add `/no-access` page (sign-out button).
11. Update `(overview)/layout.tsx` to fetch user + profile and pass to `AppSidebar`.
12. Update `AppSidebar` + `NavUser` to use real user data; sign-out action.
13. Update `approveRefund` / `rejectRefund` to read user email and write `approved_by` accordingly.
14. Tier-0 prep: `experimental.extensionAlias` attempt + cleanup; CLAUDE.md route doc fix; `AGENT_MAIL_INBOX_ID` doc-note.
15. End-to-end verification per the testing strategy.

## References

- `docs/superpowers/specs/2026-05-28-slice-e-action-layer-design.md` — slice E spec.
- `docs/initial-plan.md` — MVP spec; Current status section.
- `/Users/christianjheggfermilan/.claude/plans/distributed-fluttering-parnas.md` — approved gap-inventory plan (slice G is the recommended next focus).
- Supabase docs: `lib/supabase/{client,server,middleware}.ts` convention.
- Next.js 16 docs: `proxy.ts` (renamed from `middleware.ts`); edge runtime NOT supported in proxy.
- `@supabase/ssr` package: `createServerClient(url, anonKey, { cookies })`, `createBrowserClient`.

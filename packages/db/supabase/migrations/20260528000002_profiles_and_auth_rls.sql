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

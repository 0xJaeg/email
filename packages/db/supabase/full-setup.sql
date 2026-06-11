-- ============================================================================
-- Email Support Agent — full schema setup for a FRESH Supabase project.
--
-- Paste this entire script into the Supabase SQL Editor and run it once.
-- It is the consolidated final state of every migration (0001 .. 20260603):
-- tables, indexes, RLS (authenticated-read) policies, Realtime, and a seed
-- default product. Run on an empty project.
--
-- NOTE: This is an alternative to `supabase db push` / `migrate:up`. If you use
-- this script, don't also run the CLI migrations against this project (the
-- tables would already exist). Types already match (packages/db/src/types.gen.ts);
-- you can re-run `pnpm --filter @workspace/db gen-types` later to confirm.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- products + inboxes  (multi-product / multi-inbox foundation)
-- ----------------------------------------------------------------------------
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  platform text not null,            -- 'clickbank' | 'jvzoo'
  adapter_key text,                  -- which coded ProductAdapter handles this product
  support_config jsonb not null default '{}'::jsonb,  -- real login/reset/dashboard URLs + platform, fed to reply drafting
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_slug_idx on products (slug);

create table inboxes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  agent_mail_inbox_id text not null unique,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inboxes_product_id_idx on inboxes (product_id);

-- ----------------------------------------------------------------------------
-- threads  (one per Agent Mail conversation; routed to a product + inbox)
-- ----------------------------------------------------------------------------
create table threads (
  id uuid primary key default gen_random_uuid(),
  sender_email text not null,
  subject text not null,
  status text not null default 'open',
  agent_mail_thread_id text unique,
  product_id uuid references products(id) on delete set null,
  inbox_id uuid references inboxes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index threads_sender_email_idx on threads (sender_email);
create index threads_agent_mail_thread_id_idx on threads (agent_mail_thread_id);
create index threads_product_id_idx on threads (product_id);
create index threads_inbox_id_idx on threads (inbox_id);

-- ----------------------------------------------------------------------------
-- emails  (inbound + outbound messages; idempotent on agent_mail_message_id)
-- ----------------------------------------------------------------------------
create table emails (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  direction text not null,
  agent_mail_message_id text unique,
  from_email text not null,
  to_email text not null,
  subject text not null,
  body_text text,
  body_html text,
  raw_payload jsonb,
  received_at timestamptz not null default now()
);
create index emails_thread_id_idx on emails (thread_id);

-- ----------------------------------------------------------------------------
-- decisions  (classification + decision + approval lifecycle)
-- ----------------------------------------------------------------------------
create table decisions (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  classification text,
  refund_request_count int,
  template_used text,
  llm_model text,
  llm_reasoning text,
  decision text,
  status text not null default 'pending_action',
  draft_reply_text text,
  context jsonb,
  proposed_actions jsonb not null default '[]'::jsonb,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now()
);
create index decisions_email_id_idx on decisions (email_id);
create index decisions_status_idx on decisions (status);
create index decisions_product_id_idx on decisions (product_id);

-- ----------------------------------------------------------------------------
-- audit_log  (append-only trail across api / worker / action layer)
-- ----------------------------------------------------------------------------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  email_id uuid references emails(id) on delete set null,
  action text not null,
  payload jsonb,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);
create index audit_log_email_id_idx on audit_log (email_id);
create index audit_log_created_at_idx on audit_log (created_at desc);

-- ----------------------------------------------------------------------------
-- profiles  (dashboard allow-list + role; FK to Supabase Auth users)
-- ----------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'operator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_idx on profiles (email);

-- ----------------------------------------------------------------------------
-- suppression_list  (contacts removed from outbound email after refund/upset)
-- ----------------------------------------------------------------------------
create table suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text,
  source_decision_id uuid references decisions(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- prompt_configs  (DB-backed, editable classifier/reply instructions)
-- ----------------------------------------------------------------------------
create table prompt_configs (
  id uuid primary key default gen_random_uuid(),
  kind text not null unique,
  content text not null,
  version int not null default 1,
  is_active boolean not null default true,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- integration_credentials  (encrypted per-product API keys; ciphertext only).
-- RLS enabled with NO select policy on purpose — only the secret-key server
-- reads/decrypts these; the browser never sees ciphertext.
-- ----------------------------------------------------------------------------
create table integration_credentials (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  platform text not null,
  label text not null,
  ciphertext text not null,
  last4 text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index integration_credentials_product_id_idx on integration_credentials (product_id);
alter table integration_credentials enable row level security;

-- ----------------------------------------------------------------------------
-- action_triggers  (configurable per-product rules, e.g. the refund threshold)
-- ----------------------------------------------------------------------------
create table action_triggers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  name text not null,
  action text not null,
  condition jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index action_triggers_product_id_idx on action_triggers (product_id);
alter table action_triggers enable row level security;
create policy "authenticated read action_triggers" on action_triggers for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- Row Level Security
--   The dashboard's SSR reads use the SECRET (service-role) key, which bypasses
--   RLS. These policies gate the browser/authenticated client (incl. Realtime).
-- ----------------------------------------------------------------------------
alter table threads    enable row level security;
alter table emails     enable row level security;
alter table decisions  enable row level security;
alter table audit_log  enable row level security;
alter table products   enable row level security;
alter table inboxes    enable row level security;
alter table profiles   enable row level security;
alter table suppression_list enable row level security;
alter table prompt_configs enable row level security;

create policy "authenticated read threads"   on threads   for select to authenticated using (true);
create policy "authenticated read emails"    on emails    for select to authenticated using (true);
create policy "authenticated read decisions" on decisions for select to authenticated using (true);
create policy "authenticated read audit_log" on audit_log for select to authenticated using (true);
create policy "authenticated read products"  on products  for select to authenticated using (true);
create policy "authenticated read inboxes"   on inboxes   for select to authenticated using (true);
create policy "users read own profile"       on profiles  for select to authenticated using (auth.uid() = id);
create policy "authenticated read suppression_list" on suppression_list for select to authenticated using (true);
create policy "authenticated read prompt_configs" on prompt_configs for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- Auto-create a profile when an auth user is added. Role ALWAYS defaults to
-- 'operator' (never trust client metadata for role); promote admins explicitly.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'operator')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Realtime (live dashboard) — core activity tables only.
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table threads;
alter publication supabase_realtime add table emails;
alter publication supabase_realtime add table decisions;
alter publication supabase_realtime add table audit_log;

-- ----------------------------------------------------------------------------
-- Seeds
-- ----------------------------------------------------------------------------
-- Default product: the webhook routes unrecognized inboxes here so email is
-- never dropped (it still lands in the approval queue).
insert into products (name, slug, platform, adapter_key)
  values ('Default', 'default', 'clickbank', 'mock');

-- Your real Agent Mail inbox → default product. Replace the id + address, then
-- uncomment so the webhook routes live email to the correct product/inbox:
-- insert into inboxes (product_id, agent_mail_inbox_id, address)
-- values (
--   (select id from products where slug = 'default'),
--   '<YOUR_AGENT_MAIL_INBOX_ID>',
--   'support@yourdomain.com'
-- );

-- Bootstrap your first admin so you can log into the dashboard and manage users.
-- First create the auth user in Authentication -> Users (or sign up), then copy
-- their UUID + email here and uncomment:
-- insert into profiles (id, email, role)
-- values ('<AUTH_USER_UUID>', 'you@yourdomain.com', 'admin');

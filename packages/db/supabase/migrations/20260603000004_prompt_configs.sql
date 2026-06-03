-- Phase 6: move the worker's classifier/reply instructions out of boot-loaded
-- markdown files into the DB so they're editable without a redeploy. Global
-- (one active row per kind); per-product overrides can come later.
create table prompt_configs (
  id uuid primary key default gen_random_uuid(),
  kind text not null unique,   -- 'overview' | 'classifier' | 'policy_refund' | 'policy_faq' | 'tone'
  content text not null,
  version int not null default 1,
  is_active boolean not null default true,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table prompt_configs enable row level security;
create policy "authenticated read prompt_configs" on prompt_configs
  for select to authenticated using (true);

-- Phase 7d: configurable per-product action triggers. v1 supports the refund
-- threshold ("after N refund requests → issue refund"). `condition` is jsonb so
-- new trigger types can be added later without a migration.
create table action_triggers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,   -- null = global default
  name text not null,
  action text not null,                                        -- 'issue_refund'
  condition jsonb not null default '{}'::jsonb,                -- e.g. {"after_n_requests": 3}
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index action_triggers_product_id_idx on action_triggers (product_id);

alter table action_triggers enable row level security;
create policy "authenticated read action_triggers" on action_triggers
  for select to authenticated using (true);

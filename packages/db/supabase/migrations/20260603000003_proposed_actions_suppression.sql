-- Phase 5: model the mutating actions a decision proposes (executed only on
-- human approval), and record contacts suppressed from outbound email.
alter table decisions
  add column proposed_actions jsonb not null default '[]'::jsonb;

create table suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text,
  source_decision_id uuid references decisions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table suppression_list enable row level security;
create policy "authenticated read suppression_list" on suppression_list
  for select to authenticated using (true);

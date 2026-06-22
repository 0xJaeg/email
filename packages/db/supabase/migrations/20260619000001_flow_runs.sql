-- Persist the EXACT path the worker walked for each processed email, so the
-- per-ticket trace shows the real executed steps + the branch taken at each one
-- (not an inferred guess). One flow_runs row per processed email; one
-- flow_run_steps row per node visited, in execution order. Best-effort: the
-- worker writes these after the decision is already saved, so a logging failure
-- never affects the decision itself.
create table flow_runs (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id) on delete cascade,
  decision_id uuid references decisions(id) on delete set null,
  inbox_id uuid references inboxes(id) on delete set null,
  halted boolean not null default false,   -- flow stopped early (e.g. spam quarantine)
  created_at timestamptz not null default now()
);
create index flow_runs_email_idx on flow_runs (email_id);
create index flow_runs_decision_idx on flow_runs (decision_id);

create table flow_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references flow_runs(id) on delete cascade,
  seq int not null,                  -- execution order, 0-based
  node_id uuid,                      -- nullable: the node may be edited/deleted later
  node_key text not null,            -- snapshot so the trace survives graph edits
  node_type text not null,
  outcome text,                      -- the branch the node emitted (null if terminal/none)
  detail jsonb not null default '{}'::jsonb,  -- reserved for per-node extras (e.g. api endpoint/result)
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);
create index flow_run_steps_run_idx on flow_run_steps (run_id);

-- Doorman model (matches flow_nodes/flow_edges): browser reads via the
-- authenticated policy; the secret-key worker/server writes (bypasses RLS).
alter table flow_runs enable row level security;
alter table flow_run_steps enable row level security;
create policy "authenticated read flow_runs" on flow_runs
  for select to authenticated using (true);
create policy "authenticated read flow_run_steps" on flow_run_steps
  for select to authenticated using (true);

-- Phase A: the per-inbox decision flow. Each row is one code-defined step
-- (step_key matches a Step in the worker registry) for one inbox (null =
-- global default). The worker runs active steps in `position` order. ai_prompt
-- and condition are nullable/empty now (consumed in Increment 2 — editable steps).
create table flow_steps (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid references inboxes(id) on delete cascade,  -- null = global default flow
  step_key text not null,                                  -- 'classify' | 'enrich' | 'decide' | 'draft'
  position int not null,
  title text not null,                                     -- admin label
  description text,                                        -- what this step does (admin view)
  ai_prompt text,                                          -- per-step prompt override (Increment 2)
  condition jsonb not null default '{}'::jsonb,            -- per-step config (Increment 2)
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index flow_steps_inbox_position_idx on flow_steps (inbox_id, position);

alter table flow_steps enable row level security;
create policy "authenticated read flow_steps" on flow_steps
  for select to authenticated using (true);

-- Seed the global default flow (inbox_id null) = today's pipeline, as steps.
insert into flow_steps (inbox_id, step_key, position, title, description) values
  (null, 'classify', 1, 'Classify the ticket', 'Label the email (refund / FAQ / other) and whether the sender is an existing member or a prospective buyer.'),
  (null, 'enrich',   2, 'Check purchase & access', 'For existing members, look up their order and product access via the product adapter.'),
  (null, 'decide',   3, 'Decide the action', 'Run the refund offer-ladder / FAQ / escalation logic and choose the action + template.'),
  (null, 'draft',    4, 'Draft the reply', 'Write the customer-facing reply (when the decision is a reply/refund) and queue it for human approval.');

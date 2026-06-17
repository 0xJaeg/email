-- Phase 1: node + branch model the worker walks. flow_nodes are decision/action
-- nodes (one tree per inbox, null = global default); flow_edges route from a
-- node's outcome to the next node. Phase 1 seeds a default tree equivalent to
-- today's linear pipeline (spam_filter -> classify -> lookup_gate -> enrich ->
-- decide -> draft), so behavior is unchanged; later phases reshape edges into
-- real branching. Supersedes flow_steps (left in place until a later cleanup).
create table flow_nodes (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid references inboxes(id) on delete cascade,   -- null = global default tree
  node_key text not null,            -- stable slug within a tree (edge authoring + idempotent seeds)
  node_type text not null,           -- maps to a NodeType in the worker registry
  title text not null,               -- admin label
  description text,                  -- admin sub-text
  ai_prompt text,                    -- inline per-node prompt override (null = global fallback)
  model text,                        -- null = node-type default
  config jsonb not null default '{}'::jsonb,   -- node-type params (categories, template, ...)
  is_start boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inbox_id, node_key)
);
create index flow_nodes_inbox_idx on flow_nodes (inbox_id);
-- exactly one start per tree (coalesce handles the null/global tree)
create unique index flow_nodes_one_start_idx
  on flow_nodes (coalesce(inbox_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_start;

create table flow_edges (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid references inboxes(id) on delete cascade,    -- matches the node tree
  from_node_id uuid not null references flow_nodes(id) on delete cascade,
  to_node_id uuid not null references flow_nodes(id) on delete cascade,
  outcome text not null,             -- branch label the from-node emits ('default','not_spam',...)
  position int not null default 0,   -- display/tiebreak order
  created_at timestamptz not null default now(),
  unique (from_node_id, outcome)     -- deterministic routing: one destination per (node, outcome)
);
create index flow_edges_inbox_idx on flow_edges (inbox_id);

alter table flow_nodes enable row level security;
alter table flow_edges enable row level security;
create policy "authenticated read flow_nodes" on flow_nodes
  for select to authenticated using (true);
create policy "authenticated read flow_edges" on flow_edges
  for select to authenticated using (true);

-- Seed the global default tree (inbox_id null) = today's pipeline. node_key =
-- node_type (one of each). Idempotent via NOT EXISTS (matches existing seed style).
insert into flow_nodes (inbox_id, node_key, node_type, title, description, is_start)
select null, v.node_key, v.node_type, v.title, v.description, v.is_start
from (values
  ('spam_filter','spam_filter','Spam filter','Cheap AI check — if the message is spam/junk/auto-reply, quarantine it and stop (no further processing, no API calls).', true),
  ('classify','classify','Classify the ticket','Label the email (refund / FAQ / other) and whether the sender is an existing member or a prospective buyer.', false),
  ('lookup_gate','lookup_gate','Order-lookup gate','Cheap AI decides whether this ticket needs an order/account lookup, so we do not hit platform APIs on every ticket.', false),
  ('enrich','enrich','Check purchase & access','For existing members, look up their order and product access via the product adapter.', false),
  ('decide','decide','Decide the action','Run the refund offer-ladder / FAQ / escalation logic and choose the action + template.', false),
  ('draft','draft','Draft the reply','Write the customer-facing reply (when the decision is a reply/refund) and queue it for human approval.', false)
) as v(node_key, node_type, title, description, is_start)
where not exists (
  select 1 from flow_nodes n where n.inbox_id is null and n.node_key = v.node_key
);

-- Seed the linear edges (+ spam halts inside spam_filter, so no 'spam' edge needed).
insert into flow_edges (inbox_id, from_node_id, to_node_id, outcome, position)
select null, f.id, t.id, e.outcome, 0
from (values
  ('spam_filter','classify','not_spam'),
  ('classify','lookup_gate','default'),
  ('lookup_gate','enrich','default'),
  ('enrich','decide','default'),
  ('decide','draft','default')
) as e(from_key, to_key, outcome)
join flow_nodes f on f.inbox_id is null and f.node_key = e.from_key
join flow_nodes t on t.inbox_id is null and t.node_key = e.to_key
where not exists (
  select 1 from flow_edges x where x.from_node_id = f.id and x.outcome = e.outcome
);

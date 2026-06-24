-- Purchase check vs access check (Ben, 2026-06-24 review). Profit Dashboard is an
-- ACCESS/membership check, NOT a purchase check — a customer can buy yet be
-- missing from the dashboard. So the order is now: PURCHASE lookup (ClickBank /
-- JVZoo / Digistore) FIRST → Profit Dashboard ACCESS check → add-user-if-missing
-- → send login. If the purchase APIs can't run, ESCALATE to a human ("required to
-- search those three APIs; if they don't work, throw an error and assign to a
-- person"). The purchase + add-user APIs aren't credentialed yet, so those steps
-- are visible stubs and purchase-dependent tickets escalate until the keys land.
--
-- This applies to all three purchase-dependent branches; only login_access also
-- runs the access check + add-user (a refund needs a purchase, not dashboard
-- access). The three order_lookup nodes are re-typed IN PLACE (same id/node_key)
-- so existing edges + trace history survive. Reversible by re-typing them back to
-- order_lookup and dropping the access_check / add_to_dashboard nodes + new edges.

-- 1. Re-type the three lookup nodes order_lookup → purchase_lookup (in place).
update flow_nodes n
set node_type = 'purchase_lookup',
    title = v.title,
    description = v.description,
    updated_at = now()
from (values
  ('order_lookup','Purchase lookup','Search the selling platforms (ClickBank / JVZoo / Digistore) for a purchase under the sender''s email. found → access check; not found → can''t-find-purchase reply; APIs unavailable → escalate to a human.'),
  ('order_lookup_refund','Purchase lookup (refund)','Confirm a purchase on the selling platforms before the refund ladder. found → ladder; not found → can''t-find-purchase reply; APIs unavailable → escalate.'),
  ('order_lookup_chargeback','Purchase lookup (chargeback)','Confirm a purchase on the selling platforms before a chargeback refund. found → refund; not found → can''t-find-purchase reply; APIs unavailable → escalate.')
) as v(node_key, title, description)
where n.inbox_id is null and n.node_key = v.node_key;

-- 2. New login-branch nodes: the Profit Dashboard access check + the dashboard
--    add-user step (a stub until Madhav's add-user API lands).
insert into flow_nodes (inbox_id, node_key, node_type, title, description, ai_prompt, config)
select null, v.node_key, v.node_type, v.title, v.description, v.ai_prompt, v.config
from (values
  ('access_check','access_check','Access check (Profit Dashboard)','After a purchase is confirmed, check the Profit Dashboard for active access. has_access → send login details; no_access → add them to the dashboard; check failed → escalate.', null, '{}'::jsonb),
  ('add_to_dashboard','add_to_dashboard','Add to dashboard','Grant a confirmed buyer access via the dashboard add-user API (pending Madhav''s API), then send login. Currently a stub → escalates until the API lands.', null, '{}'::jsonb)
) as v(node_key, node_type, title, description, ai_prompt, config)
where not exists (
  select 1 from flow_nodes n where n.inbox_id is null and n.node_key = v.node_key
);

-- 3. Re-point login_access found: purchase_lookup --found--> access_check (was
--    reply_login). Idempotent (sets the same target on re-run). not_found keeps
--    routing to reply_no_order.
update flow_edges
set to_node_id = (
      select id from flow_nodes where inbox_id is null and node_key = 'access_check'
    )
where inbox_id is null
  and outcome = 'found'
  and from_node_id = (
      select id from flow_nodes where inbox_id is null and node_key = 'order_lookup'
    );

-- 4. New edges: the login access/add-user branches, plus failed → escalate on all
--    three purchase lookups (a purchase API that can't run assigns to a person).
insert into flow_edges (inbox_id, from_node_id, to_node_id, outcome, position)
select null, f.id, t.id, e.outcome, e.position
from (values
  ('order_lookup','escalate','failed',2),
  ('access_check','reply_login','has_access',0),
  ('access_check','add_to_dashboard','no_access',1),
  ('access_check','escalate','failed',2),
  ('add_to_dashboard','reply_login','success',0),
  ('add_to_dashboard','escalate','failed',1),
  ('order_lookup_refund','escalate','failed',2),
  ('order_lookup_chargeback','escalate','failed',2)
) as e(from_key, to_key, outcome, position)
join flow_nodes f on f.inbox_id is null and f.node_key = e.from_key
join flow_nodes t on t.inbox_id is null and t.node_key = e.to_key
where not exists (
  select 1 from flow_edges x where x.from_node_id = f.id and x.outcome = e.outcome
);

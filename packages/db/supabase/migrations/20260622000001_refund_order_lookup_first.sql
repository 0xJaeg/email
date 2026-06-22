-- Refund must confirm the customer FIRST (Ben, 2026-06-19 review: "we first
-- check the customer — order lookup — before going through the refund ladder").
-- Previously classify[refund] went straight to refund_ladder; now it routes
-- through an order lookup, and only a confirmed customer (a purchase OR active
-- access) reaches the offer/refund ladder. A not-found gets a refund-specific
-- "we can't locate your purchase" reply instead of an offer.
--
-- Reuses existing node types (order_lookup, send_reply) — no worker change. The
-- order_lookup node emits `found` when orders>0 OR access.hasAccess, so the live
-- Profit Dashboard membership check is a valid customer-confirmation proxy until
-- the real ClickBank/JVZoo order APIs land (Ben's keys). Reversible by
-- repointing classify[refund] back to refund_ladder and dropping the two nodes.

-- 1. New nodes: a refund-branch order lookup + its not-found reply. Dedicated
--    (not the login branch's reply_no_order) so the refund "can't find your
--    purchase" message is editable independently of the login one — every
--    branch explicit and separately editable.
insert into flow_nodes (inbox_id, node_key, node_type, title, description, ai_prompt, config)
select null, v.node_key, v.node_type, v.title, v.description, v.ai_prompt, v.config
from (values
  ('order_lookup_refund','order_lookup','Order lookup (refund)','Confirm the sender''s purchase + access before the refund ladder. found → ladder; not found → can''t-locate-purchase reply.', null, '{}'::jsonb),
  ('reply_refund_no_order','send_reply','Can''t find purchase (refund)','No purchase/access found for a refund request — ask for the order ID or the email used at checkout.','We could not find a purchase under their email, so we cannot process a refund yet. Politely explain we could not locate a purchase, and ask them to reply with their order ID or the exact email used at checkout so we can find it. Do not promise a refund.', jsonb_build_object('decision','send_faq_reply','template','FAQ_REPLY'))
) as v(node_key, node_type, title, description, ai_prompt, config)
where not exists (
  select 1 from flow_nodes n where n.inbox_id is null and n.node_key = v.node_key
);

-- 2. Repoint classify[refund]: refund_ladder → order_lookup_refund. Idempotent
--    (sets the same target on re-run). The /flows category editor reads each
--    category's target from this edge, so the reshape survives a category
--    re-save (set_classify_categories rebuilds edges from the edge targets).
update flow_edges
set to_node_id = (
      select id from flow_nodes
      where inbox_id is null and node_key = 'order_lookup_refund'
    )
where inbox_id is null
  and outcome = 'refund'
  and from_node_id = (
      select id from flow_nodes where inbox_id is null and node_key = 'classify'
    );

-- 3. New edges: order_lookup_refund branches into the ladder (found) or the
--    can't-find-purchase reply (not_found).
insert into flow_edges (inbox_id, from_node_id, to_node_id, outcome, position)
select null, f.id, t.id, e.outcome, e.position
from (values
  ('order_lookup_refund','refund_ladder','found',0),
  ('order_lookup_refund','reply_refund_no_order','not_found',1)
) as e(from_key, to_key, outcome, position)
join flow_nodes f on f.inbox_id is null and f.node_key = e.from_key
join flow_nodes t on t.inbox_id is null and t.node_key = e.to_key
where not exists (
  select 1 from flow_edges x where x.from_node_id = f.id and x.outcome = e.outcome
);

-- Chargeback as an explicit up-front category (Ben, 2026-06-19 review): a
-- customer threatening a chargeback / bank dispute (or extremely angry) skips
-- the retention-offer ladder and goes straight to a confirmed refund. Like the
-- refund branch (#56) it confirms the customer FIRST via an order lookup; only a
-- confirmed customer gets the refund, a not-found gets the "send your order ID"
-- reply. The in-ladder Sonnet chargeback judge stays as the mid-thread net for
-- threats that surface later in a normal refund thread.
--
-- Reuses existing node types (order_lookup, send_reply) — no worker change. The
-- send_reply node carries decision=issue_refund_chargeback, so DraftStep proposes
-- the refund + suppress and drafts the reply, queued for approval (draft-only).
-- Categories here are a STARTER set — Ben confirms/refines the definitions.

-- 1. Categories: narrow `refund` (no longer "or threatens a chargeback") and add
--    `chargeback`. The classifier reads config.categories; routing is the edge.
update flow_nodes
set config = jsonb_set(
  config,
  '{categories}',
  jsonb_build_array(
    jsonb_build_object('key','sales','label','Pre-sale / how to buy','description','Questions about buying, pricing, or how to purchase — NOT an existing-customer issue.'),
    jsonb_build_object('key','login_access','label','Login / access','description','An existing customer cannot log in, access the product, or find what they bought.'),
    jsonb_build_object('key','refund','label','Refund request','description','Wants a refund, cancellation, or their money back, and is NOT threatening a chargeback or a bank / card dispute.'),
    jsonb_build_object('key','general','label','General product question','description','A how-does-it-work / support question from someone who likely purchased.'),
    jsonb_build_object('key','unsubscribe','label','Unsubscribe','description','Wants to stop receiving emails / opt out.'),
    jsonb_build_object('key','other','label','Other','description','Anything that does not fit the above — route to a human.'),
    jsonb_build_object('key','chargeback','label','Chargeback / dispute','description','Threatening a chargeback or a payment / bank / card dispute, or extremely angry and demanding their money back immediately.')
  )
)
where inbox_id is null and node_key = 'classify';

-- 2. New nodes: a chargeback-branch order lookup + the chargeback refund reply.
insert into flow_nodes (inbox_id, node_key, node_type, title, description, ai_prompt, config)
select null, v.node_key, v.node_type, v.title, v.description, v.ai_prompt, v.config
from (values
  ('order_lookup_chargeback','order_lookup','Order lookup (chargeback)','Confirm the customer''s purchase + access before a chargeback refund. found → refund; not found → can''t-locate-purchase reply.', null, '{}'::jsonb),
  ('reply_refund_chargeback','send_reply','Chargeback refund','Confirmed customer threatening a chargeback — apologize, confirm the refund is processing, de-escalate. Proposes the refund + suppress; queued for approval.','The customer is upset and may be threatening a chargeback or a bank / card dispute, and we have CONFIRMED their purchase. Apologize sincerely for the frustration, confirm we are processing their full refund right away so there is no need to dispute the charge with their bank, and let them know it typically appears within 5 to 10 business days. Be warm, calm, and de-escalating. Do not argue, do not ask them to jump through hoops, and do not promise anything beyond the refund.', jsonb_build_object('decision','issue_refund_chargeback','template','REFUND_CHARGEBACK_APOLOGY'))
) as v(node_key, node_type, title, description, ai_prompt, config)
where not exists (
  select 1 from flow_nodes n where n.inbox_id is null and n.node_key = v.node_key
);

-- 3. Edges: classify[chargeback] → lookup → found:refund / not_found:can't-find.
insert into flow_edges (inbox_id, from_node_id, to_node_id, outcome, position)
select null, f.id, t.id, e.outcome, e.position
from (values
  ('classify','order_lookup_chargeback','chargeback',6),
  ('order_lookup_chargeback','reply_refund_chargeback','found',0),
  ('order_lookup_chargeback','reply_refund_no_order','not_found',1)
) as e(from_key, to_key, outcome, position)
join flow_nodes f on f.inbox_id is null and f.node_key = e.from_key
join flow_nodes t on t.inbox_id is null and t.node_key = e.to_key
where not exists (
  select 1 from flow_edges x where x.from_node_id = f.id and x.outcome = e.outcome
);

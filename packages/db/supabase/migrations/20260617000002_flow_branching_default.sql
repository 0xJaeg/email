-- Phase 3B: reshape the global default tree (inbox_id null) from the linear
-- pipeline into the category-branching tree. classify now fans out into editable
-- categories, each routing differently; the order lookup is structural (only the
-- login/access branch hits the adapter). DELIBERATE behavior change. Uses node
-- types already in the worker registry (order_lookup, refund_ladder, send_reply).
-- Reuses the existing spam_filter + classify nodes. Reversible by re-seeding the
-- linear default.

-- 1. Drop the old linear interior nodes; their edges cascade-delete. Keep
--    spam_filter (start) + classify.
delete from flow_nodes
where inbox_id is null
  and node_key in ('lookup_gate', 'enrich', 'decide', 'draft');

-- 2. Give classify its editable category set (drives the dynamic enum + branches).
update flow_nodes
set config = jsonb_build_object(
      'categories', jsonb_build_array(
        jsonb_build_object('key','sales','label','Pre-sale / how to buy','description','Questions about buying, pricing, or how to purchase — NOT an existing-customer issue.'),
        jsonb_build_object('key','login_access','label','Login / access','description','An existing customer cannot log in, access the product, or find what they bought.'),
        jsonb_build_object('key','refund','label','Refund request','description','Wants a refund, cancellation, money back, or threatens a chargeback.'),
        jsonb_build_object('key','general','label','General product question','description','A how-does-it-work / support question from someone who likely purchased.'),
        jsonb_build_object('key','unsubscribe','label','Unsubscribe','description','Wants to stop receiving emails / opt out.'),
        jsonb_build_object('key','other','label','Other','description','Anything that does not fit the above — route to a human.')
      )
    ),
    description = 'Label the ticket into one of the editable categories below; each routes down its own branch.'
where inbox_id is null and node_key = 'classify';

-- 3. New nodes: routing (order_lookup, refund_ladder) + terminal replies.
insert into flow_nodes (inbox_id, node_key, node_type, title, description, ai_prompt, config)
select null, v.node_key, v.node_type, v.title, v.description, v.ai_prompt, v.config
from (values
  ('reply_sales','send_reply','Sales reply','Answer the pre-sale question; no order lookup.','Answer the prospective buyer''s question and point them to how to purchase. Do not assume they are an existing customer.', jsonb_build_object('decision','send_faq_reply','template','FAQ_REPLY')),
  ('order_lookup','order_lookup','Order lookup','Look up the sender''s purchase + access via the product adapter (JVZoo / ClickBank / Digistore).', null, '{}'::jsonb),
  ('reply_login','send_reply','Send login help','Use the looked-up order + access to help them log in / reach the product.','Use the customer''s order and access details to help them log in or access the product. Be specific and warm.', jsonb_build_object('decision','send_faq_reply','template','FAQ_REPLY')),
  ('reply_no_order','send_reply','Can''t find order','We could not find a purchase for their email — ask them to confirm.','We could not find a purchase under their email. Politely ask them to confirm the exact email used at checkout, or share an order ID, so we can locate it.', jsonb_build_object('decision','send_faq_reply','template','FAQ_REPLY')),
  ('refund_ladder','refund_ladder','Refund ladder','Offer-ladder / chargeback tree (offer 1 → offer 2 → refund); threshold from triggers.', null, '{}'::jsonb),
  ('reply_refund','send_reply','Send refund reply','Draft the offer/refund reply the ladder chose (correct template + proposed actions), queued for approval.', null, '{}'::jsonb),
  ('reply_general','send_reply','General reply','Answer the general product question from the training docs.','Answer the product/support question using the business overview and FAQ. Helpful and concise.', jsonb_build_object('decision','send_faq_reply','template','FAQ_REPLY')),
  ('reply_unsubscribe','send_reply','Unsubscribe reply','Acknowledge the unsubscribe and confirm removal.','Acknowledge their request to unsubscribe and confirm they will be removed from mailings. Keep it short.', jsonb_build_object('decision','send_faq_reply','template','FAQ_REPLY')),
  ('escalate','send_reply','Escalate to human','No automated branch fits — route to a human.', null, jsonb_build_object('decision','escalate'))
) as v(node_key, node_type, title, description, ai_prompt, config)
where not exists (
  select 1 from flow_nodes n where n.inbox_id is null and n.node_key = v.node_key
);

-- 4. New edges: classify fans out by category; order_lookup + refund_ladder branch.
insert into flow_edges (inbox_id, from_node_id, to_node_id, outcome, position)
select null, f.id, t.id, e.outcome, e.position
from (values
  ('classify','reply_sales','sales',0),
  ('classify','order_lookup','login_access',1),
  ('classify','refund_ladder','refund',2),
  ('classify','reply_general','general',3),
  ('classify','reply_unsubscribe','unsubscribe',4),
  ('classify','escalate','other',5),
  ('order_lookup','reply_login','found',0),
  ('order_lookup','reply_no_order','not_found',1),
  ('refund_ladder','reply_refund','default',0)
) as e(from_key, to_key, outcome, position)
join flow_nodes f on f.inbox_id is null and f.node_key = e.from_key
join flow_nodes t on t.inbox_id is null and t.node_key = e.to_key
where not exists (
  select 1 from flow_edges x where x.from_node_id = f.id and x.outcome = e.outcome
);

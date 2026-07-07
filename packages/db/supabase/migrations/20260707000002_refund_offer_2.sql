-- Extend the save-the-sale refund tree to a TWO-offer ladder (per the meeting:
-- Offer 1 → wait → declined → Offer 2 → wait → declined → refund). Offer 1
-- (reply_save_no_problem — the coaching offer) is unchanged; this adds a second
-- offer + its await/resume node, and repoints "declined Offer 1" from the refund
-- node to Offer 2. The reply/resume engine, send_reply / reply_branch nodes, the
-- ticket trace, and the /flows subgraph all already handle these node types, so
-- this is a data-only change.
--
-- Resulting no_problem branch:
--   refund_problem_gate[no_problem] → reply_save_no_problem (Offer 1)
--   await_save_no_problem_reply: accepted → stop; new_topic → classify;
--                                not_accepted → reply_save_offer_2 (Offer 2)   ← repointed
--   await_offer_2_reply:         accepted → stop; new_topic → classify;
--                                not_accepted → refund_issue
--
-- Reversible: repoint await_save_no_problem_reply[not_accepted] back to
-- refund_issue and drop the two new nodes/edges.

-- 1. New nodes: Offer 2 (send_reply, terminal + awaits reply) and its await node.
insert into flow_nodes (inbox_id, node_key, node_type, title, description, ai_prompt, config)
select null, v.node_key, v.node_type, v.title, v.description, v.ai_prompt, v.config
from (values
  (
    'reply_save_offer_2','send_reply','Save the sale: second offer',
    'Offer 1 was declined — make one more, stronger retention offer, then await their reply. The refund stays on the table. (Set this offer''s own fulfillment action in config.proposed_actions when it is defined.)',
    'The customer already declined our first offer (the free coaching series) and still leans toward a refund, but has NOT named a specific product problem. Make ONE more, stronger good-faith offer to keep them — for example an exclusive bonus, hands-on help getting set up, or extended access (use the specific second offer configured for this product, if any). Keep it warm and low-pressure, be clear this is the last nudge, and that the refund is still easy if they would rather. Do NOT process or promise a refund.',
    jsonb_build_object(
      'decision','send_faq_reply',
      'template','SAVE_THE_SALE_OFFER_2',
      'awaits_reply_at','await_offer_2_reply'
    )
  ),
  (
    'await_offer_2_reply','reply_branch','Reply: accepted the second offer?',
    'Resume point after the second offer. Reads the customer''s reply: accepted / still wants the refund / new topic.',
    'We made the customer a SECOND retention offer instead of a refund. Read their reply. Choose `accepted` if they will take the offer or are satisfied; `not_accepted` if they decline and still want the refund; or `new_topic` if their reply is about a brand-new topic unrelated to the offer.',
    jsonb_build_object('branches', jsonb_build_array(
      jsonb_build_object('key','accepted','description','They accept the second offer / are satisfied.'),
      jsonb_build_object('key','not_accepted','description','They decline and still want the refund.'),
      jsonb_build_object('key','new_topic','description','A brand-new topic unrelated to the offer.')
    ))
  )
) as v(node_key, node_type, title, description, ai_prompt, config)
where not exists (
  select 1 from flow_nodes n where n.inbox_id is null and n.node_key = v.node_key
);

-- 2. Repoint "declined Offer 1": await_save_no_problem_reply[not_accepted]
--    refund_issue → reply_save_offer_2. Idempotent (same target on re-run).
update flow_edges
set to_node_id = (
      select id from flow_nodes where inbox_id is null and node_key = 'reply_save_offer_2'
    )
where inbox_id is null
  and outcome = 'not_accepted'
  and from_node_id = (
      select id from flow_nodes where inbox_id is null and node_key = 'await_save_no_problem_reply'
    );

-- 3. New edges from the Offer 2 await node (mirrors the Offer 1 await node).
--    reply_save_offer_2 itself is terminal (awaits a reply) — no outgoing edge.
insert into flow_edges (inbox_id, from_node_id, to_node_id, outcome, position)
select null, f.id, t.id, e.outcome, e.position
from (values
  ('await_offer_2_reply','stop_do_nothing','accepted',0),
  ('await_offer_2_reply','refund_issue','not_accepted',1),
  ('await_offer_2_reply','classify','new_topic',2)
) as e(from_key, to_key, outcome, position)
join flow_nodes f on f.inbox_id is null and f.node_key = e.from_key
join flow_nodes t on t.inbox_id is null and t.node_key = e.to_key
where not exists (
  select 1 from flow_edges x where x.from_node_id = f.id and x.outcome = e.outcome
);

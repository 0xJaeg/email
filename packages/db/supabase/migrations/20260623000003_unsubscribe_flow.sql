-- Unsubscribe multi-step flow (Ben's design): classify[unsubscribe] now calls the
-- MailWizz unsubscribe endpoint and branches on the response — success /
-- email_not_found / failed — instead of a single acknowledgement that suppressed
-- only at approval (#60). The unsubscribe_call node performs the removal in-flow
-- (gated APP_ENV=production; dev skips → "skipped" → success reply), always writes
-- the internal suppression_list, and captures the HTTP request/response for the
-- trace. The reply nodes only DRAFT (approval-gated). A scoped exception to the
-- approval rule for unsubscribe — sends + refunds stay approval-gated.

-- 1. New nodes: the MailWizz call + the success / not-found replies. Reply nodes
--    use decision=send_faq_reply (no suppress proposal — suppression is in-flow).
insert into flow_nodes (inbox_id, node_key, node_type, title, description, ai_prompt, config)
select null, v.node_key, v.node_type, v.title, v.description, v.ai_prompt, v.config
from (values
  ('unsubscribe_call','unsubscribe_call','Unsubscribe (MailWizz)','Call the MailWizz unsubscribe-from-all-lists endpoint and branch on the response: success / email_not_found / failed. Records the internal opt-out + the HTTP request/response. Live only when APP_ENV=production; dev skips the call.', null, '{}'::jsonb),
  ('reply_unsubscribed','send_reply','Unsubscribed reply','Confirm the customer has been removed from all marketing emails.','The customer asked to unsubscribe and we have removed them from all marketing emails. Confirm they are unsubscribed and will not receive further marketing messages. Keep it short, polite, and final.', jsonb_build_object('decision','send_faq_reply')),
  ('reply_unsub_not_found','send_reply','Unsubscribe — email not found','We could not find their email in the marketing system — ask them to confirm the address.','The customer asked to unsubscribe, but we could not find their email address in our marketing system. Politely say we could not locate it on our list, and ask them to confirm the exact email address they receive our emails at so we can remove it. Keep it short.', jsonb_build_object('decision','send_faq_reply'))
) as v(node_key, node_type, title, description, ai_prompt, config)
where not exists (
  select 1 from flow_nodes n where n.inbox_id is null and n.node_key = v.node_key
);

-- 2. Repoint classify[unsubscribe] → unsubscribe_call (was reply_unsubscribe).
update flow_edges
set to_node_id = (
      select id from flow_nodes
      where inbox_id is null and node_key = 'unsubscribe_call'
    )
where inbox_id is null
  and outcome = 'unsubscribe'
  and from_node_id = (
      select id from flow_nodes where inbox_id is null and node_key = 'classify'
    );

-- 3. Branch edges off unsubscribe_call (skipped → the success reply, for dev).
insert into flow_edges (inbox_id, from_node_id, to_node_id, outcome, position)
select null, f.id, t.id, e.outcome, e.position
from (values
  ('unsubscribe_call','reply_unsubscribed','success',0),
  ('unsubscribe_call','reply_unsubscribed','skipped',1),
  ('unsubscribe_call','reply_unsub_not_found','email_not_found',2),
  ('unsubscribe_call','escalate','failed',3)
) as e(from_key, to_key, outcome, position)
join flow_nodes f on f.inbox_id is null and f.node_key = e.from_key
join flow_nodes t on t.inbox_id is null and t.node_key = e.to_key
where not exists (
  select 1 from flow_edges x where x.from_node_id = f.id and x.outcome = e.outcome
);

-- 4. Drop the now-orphaned single-step unsubscribe reply (classify no longer
--    points to it; it had no outgoing edges).
delete from flow_nodes where inbox_id is null and node_key = 'reply_unsubscribe';

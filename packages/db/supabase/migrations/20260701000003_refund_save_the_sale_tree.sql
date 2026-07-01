-- Refund "save the sale" decision tree (Ben, 2026-06-30 call + Google Draw).
-- Replaces the single reply_refund node with the real branching tree:
--   order_lookup_refund[found] → refund_problem_gate
--     problem     → reply_help_problem      (help using support facts)
--     no_problem  → reply_save_no_problem   (offer the coaching series)
-- Each offer/help reply is terminal and AWAITS a customer reply (the send worker
-- stamps the thread's resume cursor from config.awaits_reply_at). When they
-- reply, the flow resumes at the await_* node:
--   await_save_no_problem_reply: accepted → stop; not_accepted → refund_issue
--   await_help_problem_reply:    complete → stop; wants_refund → refund_issue;
--                                general → reply_help_problem; new_topic → classify
-- refund_issue drafts an issue_refund decision (draft-only; the real refund +
-- its success/fail resolve at human approval). stop_do_nothing closes the ticket.
--
-- Ben asked to keep it to ONE offer for now; the reply_branch / await_* structure
-- extends to an offer-1/offer-2 ladder later. Reversible: repoint
-- order_lookup_refund[found] back to refund_ladder and drop the new nodes/edges.

-- 1. New nodes.
insert into flow_nodes (inbox_id, node_key, node_type, title, description, ai_prompt, config)
select null, v.node_key, v.node_type, v.title, v.description, v.ai_prompt, v.config
from (values
  (
    'refund_problem_gate','reply_branch','Refund: problem or not?',
    'Did the refund request name a specific product problem, or is it a no-reason money-back ask? Routes to help (problem) or the retention offer (no_problem).',
    'The customer is asking for a refund. Did they state a SPECIFIC problem (a concrete issue with the product — it does not work, they cannot do something, a feature is broken), or are they just asking for their money back with no reason given? Choose `problem` if they named a concrete issue, or `no_problem` if they gave no specific reason.',
    jsonb_build_object('branches', jsonb_build_array(
      jsonb_build_object('key','problem','description','They named a concrete product issue / a reason for wanting the refund.'),
      jsonb_build_object('key','no_problem','description','No specific reason given — they just want their money back.')
    ))
  ),
  (
    'reply_save_no_problem','send_reply','Save the sale: coaching offer',
    'No-reason refund — offer the free coaching series instead (proposes coaching_signup) and await their reply.',
    'The customer asked for a refund but gave no specific problem. Do NOT process or promise a refund. Warmly let them know we have added them to our free coaching email series (starting today) that helps people get real results, and invite them to give it a try before deciding. Keep it low-pressure, and let them know the refund is still available if they would rather. This is a single, friendly offer.',
    jsonb_build_object(
      'decision','send_faq_reply',
      'template','SAVE_THE_SALE_OFFER',
      'awaits_reply_at','await_save_no_problem_reply',
      'proposed_actions', jsonb_build_array(jsonb_build_object('type','coaching_signup'))
    )
  ),
  (
    'await_save_no_problem_reply','reply_branch','Reply: accepted the offer?',
    'Resume point after the coaching offer. Reads the customer''s reply: accepted / still wants the refund / new topic.',
    'We offered this customer our free coaching series instead of a refund. Read their reply. Choose `accepted` if they will try it or say thanks; `not_accepted` if they decline and still want the refund; or `new_topic` if their reply is about a brand-new topic unrelated to the offer.',
    jsonb_build_object('branches', jsonb_build_array(
      jsonb_build_object('key','accepted','description','They accept the coaching offer / will try it / are satisfied.'),
      jsonb_build_object('key','not_accepted','description','They decline and still want the refund.'),
      jsonb_build_object('key','new_topic','description','A brand-new topic unrelated to the refund offer.')
    ))
  ),
  (
    'reply_help_problem','send_reply','Save the sale: help solve it',
    'Specific problem — try to resolve it with the support facts, keep the refund easy, and await their reply.',
    'The customer described a specific problem and wants a refund. Using the product support facts provided, genuinely help them solve that exact problem so they do not need the refund. Be concrete and specific to what they said. Keep it friendly, and make clear the refund is still easy if they would still prefer it. Do not confirm a refund.',
    jsonb_build_object(
      'decision','send_faq_reply',
      'template','PROBLEM_HELP',
      'awaits_reply_at','await_help_problem_reply'
    )
  ),
  (
    'await_help_problem_reply','reply_branch','Reply: resolved, refund, or question?',
    'Resume point after trying to help. Reads the reply: resolved / still wants refund / a further question / new topic.',
    'We tried to help the customer solve their problem instead of refunding. Read their reply. Choose `complete` if they are satisfied or the issue is resolved; `wants_refund` if they still want the refund; `general` if they are asking a further product question we should answer; or `new_topic` if it is a brand-new unrelated topic.',
    jsonb_build_object('branches', jsonb_build_array(
      jsonb_build_object('key','complete','description','Satisfied / the issue is resolved — nothing more to do.'),
      jsonb_build_object('key','wants_refund','description','They still want the refund.'),
      jsonb_build_object('key','general','description','A further product question we should answer, then keep helping.'),
      jsonb_build_object('key','new_topic','description','A brand-new topic unrelated to the refund.')
    ))
  ),
  (
    'refund_issue','refund_draft','Process refund',
    'Drafts an issue_refund decision (refund + suppress) for human approval. The actual refund and its success/fail happen at approval.',
    'The customer still wants a refund after we tried to help or make an offer. Acknowledge their request warmly, let them know we are processing their refund, and set the expectation that it typically appears within 5 to 10 business days. Be gracious — do not argue or try again to talk them out of it. Do not claim the refund is already completed.',
    '{}'::jsonb
  ),
  (
    'stop_do_nothing','stop','Done (saved / resolved)',
    'Terminal: the customer accepted the offer or is satisfied. Closes the ticket; nothing is sent or refunded.',
    null,
    '{}'::jsonb
  )
) as v(node_key, node_type, title, description, ai_prompt, config)
where not exists (
  select 1 from flow_nodes n where n.inbox_id is null and n.node_key = v.node_key
);

-- 2. Repoint order_lookup_refund[found]: refund_ladder → refund_problem_gate.
--    Idempotent (sets the same target on re-run). refund_ladder stays registered
--    for other trees; the default refund branch just no longer routes through it.
update flow_edges
set to_node_id = (
      select id from flow_nodes
      where inbox_id is null and node_key = 'refund_problem_gate'
    )
where inbox_id is null
  and outcome = 'found'
  and from_node_id = (
      select id from flow_nodes where inbox_id is null and node_key = 'order_lookup_refund'
    );

-- 3. New edges.
insert into flow_edges (inbox_id, from_node_id, to_node_id, outcome, position)
select null, f.id, t.id, e.outcome, e.position
from (values
  ('refund_problem_gate','reply_help_problem','problem',0),
  ('refund_problem_gate','reply_save_no_problem','no_problem',1),
  ('await_save_no_problem_reply','stop_do_nothing','accepted',0),
  ('await_save_no_problem_reply','refund_issue','not_accepted',1),
  ('await_save_no_problem_reply','classify','new_topic',2),
  ('await_help_problem_reply','stop_do_nothing','complete',0),
  ('await_help_problem_reply','refund_issue','wants_refund',1),
  ('await_help_problem_reply','reply_help_problem','general',2),
  ('await_help_problem_reply','classify','new_topic',3)
) as e(from_key, to_key, outcome, position)
join flow_nodes f on f.inbox_id is null and f.node_key = e.from_key
join flow_nodes t on t.inbox_id is null and t.node_key = e.to_key
where not exists (
  select 1 from flow_edges x where x.from_node_id = f.id and x.outcome = e.outcome
);

-- 4. The stop node writes a decision with status 'closed'; teach the ticket view
--    to bucket that as done (otherwise a saved/closed ticket lingers as open).
create or replace view thread_tickets
with (security_invoker = on) as
select
  t.id,
  t.sender_email,
  t.subject,
  t.created_at,
  t.status as thread_status,
  d.decision_id,
  d.classification,
  d.decision,
  d.decision_status,
  d.template_used,
  d.llm_reasoning,
  d.draft_reply_text,
  d.context,
  d.proposed_actions,
  d.body_text,
  case
    when d.decision_status in ('pending_approval', 'needs_human') then 'open'
    when d.decision_status in ('sent', 'failed', 'rejected', 'quarantined', 'closed') then 'done'
    -- no decision yet / transient 'approved' → still open (work not finished)
    else 'open'
  end as state
from threads t
left join lateral (
  select
    dd.id as decision_id,
    dd.classification,
    dd.decision,
    dd.status as decision_status,
    dd.template_used,
    dd.llm_reasoning,
    dd.draft_reply_text,
    dd.context,
    dd.proposed_actions,
    e.body_text,
    dd.created_at
  from emails e
  join decisions dd on dd.email_id = e.id
  where e.thread_id = t.id
  order by dd.created_at desc
  limit 1
) d on true;

grant select on thread_tickets to authenticated, service_role;

-- Add a computed `lookup_outcome` to the thread_tickets view so the ticket list
-- can filter by the purchase/access lookup result across tickets — Ben's ask to
-- verify, at a glance, why a lookup FOUND something, found NOTHING, or COULD NOT
-- run (a failed lookup is distinct from a real miss). Derived from the latest
-- decision's context.lookups + context.orders. Everything else in the view is
-- unchanged (this just appends the column).
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
  end as state,
  case
    -- a lookup threw (endpoint down / DB error) → we could NOT verify the purchase;
    -- this is distinct from a genuine "no order for this email".
    when exists (
      select 1
      from jsonb_array_elements(coalesce(d.context->'lookups', '[]'::jsonb)) as lk
      where lk->>'ok' = 'false'
        and lk->>'operation' in ('order_lookup', 'access_check')
    ) then 'failed'
    -- an active order was found for this email
    when jsonb_array_length(coalesce(d.context->'orders', '[]'::jsonb)) > 0 then 'found'
    -- a lookup ran cleanly and found nothing
    when jsonb_array_length(coalesce(d.context->'lookups', '[]'::jsonb)) > 0 then 'not_found'
    -- no lookup ran (spam, or a plain reply that doesn't check a purchase)
    else null
  end as lookup_outcome
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

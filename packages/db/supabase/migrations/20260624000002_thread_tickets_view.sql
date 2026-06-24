-- Unified ticket list (merges /tickets + /approvals + /activity into one filtered
-- Tickets page). One row per thread = the thread joined to its LATEST decision,
-- with a computed open/done state so the page can filter + paginate by state.
-- Carries the latest decision's payload so an "open" row can render the inline
-- approve/reject sheet without a second fetch. security_invoker so the view
-- honors the existing doorman RLS (the server still reads via the secret key).
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
    when d.decision_status in ('sent', 'failed', 'rejected', 'quarantined') then 'done'
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

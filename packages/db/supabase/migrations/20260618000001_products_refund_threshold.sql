-- Move the refund threshold onto products directly. A "trigger" was only ever one
-- integer per product (action_triggers.condition.after_n_requests for the single
-- issue_refund action), so a dedicated table + /triggers page was overkill. The
-- worker now reads products.refund_threshold (null = the built-in default of 3).
--
-- Backfill from the existing active issue_refund triggers. action_triggers is KEPT
-- here on purpose — the currently-deployed worker still reads it; it's dropped
-- post-deploy together with flow_steps / prompt_configs / prompt_templates.
alter table products add column refund_threshold int;

update products p
set refund_threshold = (t.condition ->> 'after_n_requests')::int
from action_triggers t
where t.product_id = p.id
  and t.action = 'issue_refund'
  and t.is_active
  and (t.condition ->> 'after_n_requests') is not null;

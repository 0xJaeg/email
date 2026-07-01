-- Durable link on a reply email back to the decision it is responding to. Set
-- by the webhook when an inbound email lands on a thread whose cursor is set.
-- The resumed run reads resumed_from_decision_id to load the prior context, and
-- the per-ticket trace stays reconstructable even after the thread cursor
-- advances or clears.
alter table emails
  add column if not exists is_reply boolean not null default false,
  add column if not exists resumed_from_decision_id uuid references decisions(id) on delete set null;

create index if not exists emails_resumed_from_decision_id_idx
  on emails (resumed_from_decision_id);

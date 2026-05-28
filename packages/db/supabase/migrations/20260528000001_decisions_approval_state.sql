alter table decisions
  add column status text not null default 'pending_action',
  add column draft_reply_text text,
  add column approved_at timestamptz,
  add column approved_by text;

create index decisions_status_idx on decisions (status);

-- Existing rows: treat any existing decision as 'sent' (they predate the action layer
-- and shouldn't show up in the approval queue).
update decisions set status = 'sent' where status = 'pending_action';

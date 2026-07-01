-- Per-thread "conversation cursor": where a thread is waiting for a customer
-- reply so the decision flow can resume at that node instead of restarting at
-- the spam filter. Null resume_node_key = no pending reply = a fresh run.
--
-- The cursor is stamped only when an offer/question reply is actually sent to
-- the customer (at approval, in the send worker), and cleared when a reply
-- resumes the flow.
alter table threads
  add column if not exists resume_node_key text,
  add column if not exists resume_from_decision_id uuid references decisions(id) on delete set null,
  add column if not exists awaiting_reply_since timestamptz;

create index if not exists threads_resume_node_key_idx
  on threads (resume_node_key)
  where resume_node_key is not null;

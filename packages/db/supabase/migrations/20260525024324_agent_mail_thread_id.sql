alter table threads add column agent_mail_thread_id text unique;
create index threads_agent_mail_thread_id_idx on threads (agent_mail_thread_id);

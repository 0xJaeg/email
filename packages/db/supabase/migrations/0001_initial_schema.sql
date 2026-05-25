create extension if not exists "uuid-ossp";

create table threads (
  id uuid primary key default gen_random_uuid(),
  sender_email text not null,
  subject text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index threads_sender_email_idx on threads (sender_email);

create table emails (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  direction text not null,
  agent_mail_message_id text unique,
  from_email text not null,
  to_email text not null,
  subject text not null,
  body_text text,
  body_html text,
  raw_payload jsonb,
  received_at timestamptz not null default now()
);
create index emails_thread_id_idx on emails (thread_id);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id) on delete cascade,
  classification text,
  refund_request_count int,
  template_used text,
  llm_model text,
  llm_reasoning text,
  decision text,
  created_at timestamptz not null default now()
);
create index decisions_email_id_idx on decisions (email_id);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  email_id uuid references emails(id) on delete set null,
  action text not null,
  payload jsonb,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);
create index audit_log_email_id_idx on audit_log (email_id);
create index audit_log_created_at_idx on audit_log (created_at desc);

-- Phase C: a library of named, verbatim response templates the agent can draw
-- on when drafting replies (keeps long canned answers editable + out of the
-- core prompt). Worker injects the active templates into the reply prompt;
-- admins manage them at /templates.
create table prompt_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- unique slug/key, e.g. 'login_help'
  title text not null,                -- human label
  content text not null,              -- verbatim template body
  is_active boolean not null default true,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index prompt_templates_name_idx on prompt_templates (name);

alter table prompt_templates enable row level security;
create policy "authenticated read prompt_templates" on prompt_templates
  for select to authenticated using (true);

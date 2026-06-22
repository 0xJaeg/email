-- Global app settings (a single row). First use: a daily refund cap + the
-- recipients to alert when it's hit. Refunds execute at human approval, so the
-- cap is enforced there (apps/web/lib/approvals.ts), not in the worker.
-- refund_daily_limit null = no cap (off). The dashboard reads these to show the
-- "refunds today" counter + a warning, so authenticated SELECT is allowed; only
-- the secret-key server writes (doorman model).
create table app_settings (
  id boolean primary key default true,
  refund_daily_limit int,                                  -- null = no cap
  refund_alert_recipients text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint app_settings_singleton check (id)
);
insert into app_settings (id) values (true) on conflict do nothing;

alter table app_settings enable row level security;
create policy "authenticated read app_settings" on app_settings
  for select to authenticated using (true);

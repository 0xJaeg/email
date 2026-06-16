-- Make the deny-all on integration_credentials explicit. RLS was enabled with no
-- policy on purpose (see 20260603000006_integration_credentials.sql) — an implicit
-- deny — but linter 0008_rls_enabled_no_policy can't tell deliberate lockdown from
-- an oversight. This policy encodes the intent: anon/authenticated (the browser)
-- get nothing; the secret-key server (service_role) bypasses RLS and still reads to
-- decrypt. No behavior change — it documents the lockdown and clears the lint.
create policy "deny all client access" on public.integration_credentials
  for all
  to anon, authenticated
  using (false)
  with check (false);

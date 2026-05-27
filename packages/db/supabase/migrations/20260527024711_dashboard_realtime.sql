-- Dashboard read access + Realtime.
--
-- SECURITY NOTE (MVP placeholder): the policies below grant the `anon` role
-- read access to ALL support data. The dashboard ships the publishable key to
-- the browser, so anyone who can load the dashboard can read every email,
-- thread, decision, and audit entry. This is acceptable only for local/internal
-- MVP use. Before deploying or handling real customer data, replace these
-- anon-read policies with authenticated-only policies (Supabase Auth) and
-- scope rows appropriately.

alter table threads enable row level security;
alter table emails enable row level security;
alter table decisions enable row level security;
alter table audit_log enable row level security;

create policy "anon read threads" on threads for select to anon using (true);
create policy "anon read emails" on emails for select to anon using (true);
create policy "anon read decisions" on decisions for select to anon using (true);
create policy "anon read audit_log" on audit_log for select to anon using (true);

-- Realtime: broadcast row changes on these tables to subscribed clients.
alter publication supabase_realtime add table threads;
alter publication supabase_realtime add table emails;
alter publication supabase_realtime add table decisions;
alter publication supabase_realtime add table audit_log;

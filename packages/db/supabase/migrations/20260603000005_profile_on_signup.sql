-- Auto-create a profile whenever an auth user is added (Supabase Auth UI,
-- signup, or the admin /users flow). Role ALWAYS defaults to 'operator' — never
-- trust client-supplied metadata for role, or open signups could self-grant
-- admin. Promote admins explicitly (SQL for the first; the /users page after).
--
-- The /users createUser action upserts its profile row, so it still controls
-- role/name for users it creates even though this trigger fires first.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'operator')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

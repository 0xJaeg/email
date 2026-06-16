-- Lock the signup trigger function out of the public API surface.
-- PostgREST exposes every EXECUTE-able function in `public` as an RPC endpoint
-- (/rest/v1/rpc/handle_new_user), and Supabase's default privileges grant EXECUTE
-- to PUBLIC/anon/authenticated on new functions — so this trigger-only function
-- was callable by anyone (database linter 0028/0029).
--
-- It only ever runs as the AFTER INSERT trigger on auth.users (see
-- 20260603000005_profile_on_signup.sql); trigger execution does not check EXECUTE
-- on the function, so revoking these grants closes the API exposure without
-- affecting signup. It stays SECURITY DEFINER — it writes to RLS-protected
-- public.profiles, so SECURITY INVOKER would break it.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- In-app account deletion (App Store requirement; SECURITY.md). Deleting the auth user cascades
-- to every athlete table (tested in rls_test.sql), so nothing about the athlete is left behind.
-- Gyms they created stay for their members, with the creator cleared.
create or replace function public.delete_my_account() returns void
language plpgsql volatile security definer set search_path = public, auth, pg_temp as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from auth.users where id = me;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Account deletion from the app (delete_my_account). Every check raises on failure.
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
create or replace function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin execute stmt; return false; exception when others then return true; end $$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.test');
set role service_role;
insert into public.athletes (id, user_id) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002');
insert into public.completed_workouts (athlete_id, workout_date, sport, status, rpe) values
  ('a0000000-0000-0000-0000-00000000000a', current_date, 'run', 'completed', 5),
  ('b0000000-0000-0000-0000-00000000000b', current_date, 'run', 'completed', 5);
insert into public.leaderboard_profiles (athlete_id, nickname) values ('a0000000-0000-0000-0000-00000000000a', 'Aye');
insert into public.gyms (id, name, join_code, created_by) values ('a5000000-0000-0000-0000-00000000000a', 'A Gym', 'AAAAAA', 'a0000000-0000-0000-0000-00000000000a');
reset role;

begin;
set local role anon;
select pg_temp.expect(pg_temp.fails('select public.delete_my_account()'), 'signed-out visitors cannot delete anything');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select public.delete_my_account();
commit;

select pg_temp.expect(not exists (select 1 from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'the signed-in user''s account is deleted');
select pg_temp.expect(not exists (select 1 from public.athletes where id = 'a0000000-0000-0000-0000-00000000000a')
  and not exists (select 1 from public.completed_workouts where athlete_id = 'a0000000-0000-0000-0000-00000000000a')
  and not exists (select 1 from public.leaderboard_profiles where athlete_id = 'a0000000-0000-0000-0000-00000000000a'),
  'their athlete data, logs and leaderboard profile are gone');
select pg_temp.expect((select created_by from public.gyms where id = 'a5000000-0000-0000-0000-00000000000a') is null,
  'a gym they created stays for its members, without them');
select pg_temp.expect(exists (select 1 from auth.users where id = 'bbbbbbbb-0000-0000-0000-000000000002')
  and (select count(*) from public.completed_workouts where athlete_id = 'b0000000-0000-0000-0000-00000000000b') = 1,
  'other athletes are untouched');

\echo 'ALL ACCOUNT DELETION TESTS PASSED'

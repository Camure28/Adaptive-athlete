-- Leaderboard security and scoring tests (D-029). Every check raises on failure.
-- Run with: bash supabase/tests/run_rls_tests.sh  (each *_test.sql gets a fresh database)

\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Runs a statement and reports whether it failed (as the current role).
create or replace function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Fixtures: four athletes. A and B will join a gym; C never opts in; D opts in without a gym.
-- A has two sessions planned in the last week and completed one of them.
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.test'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@example.test'),
  ('dddddddd-0000-0000-0000-000000000004', 'd@example.test');

set role service_role;
insert into public.athletes (id, user_id) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-000000000003'),
  ('d0000000-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-000000000004');
insert into public.goals (id, athlete_id, kind, event_date, hyrox_division) values
  ('a1000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'hyrox', current_date + 120, 'men_open');
insert into public.training_plans (id, athlete_id, goal_id) values
  ('a2000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a');
insert into public.plan_versions (id, plan_id, athlete_id, version, engine_version, basis, reason, starts_on, weeks, inputs) values
  ('a3000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 1, 'test', '{}', 'generated',
   current_date - 6, '[]', '{}');
insert into public.planned_workouts (plan_version_id, athlete_id, workout_key, scheduled_date, position, sport, session_type, title, estimated_minutes, planned_load, body) values
  ('a3000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'k1', current_date - 3, 0, 'run', 'easy_run', 'Easy run', 40, 100, '{}'),
  ('a3000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'k2', current_date - 1, 0, 'hyrox', 'compromised_run', 'Compromised run', 45, 300, '{}'),
  ('a3000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'k3', current_date - 1, 1, 'other', 'rest', 'Rest', 0, 0, '{}');
insert into public.completed_workouts (athlete_id, plan_id, workout_key, workout_date, sport, status, rpe, pain_level, notes) values
  ('a0000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-00000000000a', 'k1', current_date - 3, 'run', 'completed', 3, 4, 'private note');
insert into public.completed_workouts (athlete_id, workout_date, sport, status, rpe) values
  ('b0000000-0000-0000-0000-00000000000b', current_date - 2, 'run', 'completed', 5),
  ('b0000000-0000-0000-0000-00000000000b', current_date - 1, 'strength', 'completed', 6),
  ('d0000000-0000-0000-0000-00000000000d', current_date - 40, 'run', 'completed', 5);
reset role;

-- ---------------------------------------------------------------------------------------------
-- Opting in, nicknames, gyms
-- ---------------------------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.leaderboard_profiles (athlete_id, nickname) values ('a0000000-0000-0000-0000-00000000000a', 'CamRuns');
select pg_temp.expect(pg_temp.fails($$insert into public.leaderboard_profiles (athlete_id, nickname) values ('b0000000-0000-0000-0000-00000000000b', 'Imposter')$$),
  'an athlete cannot create a leaderboard profile for someone else');
create temp table code_a as select join_code from public.create_gym('Ure CrossFit');
select pg_temp.expect((select join_code from code_a) ~ '^[A-Z0-9]{6}$', 'creating a gym returns a 6-character join code');
select pg_temp.expect((select count(*) from public.gyms) = 1, 'A can see their own gym');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.expect(pg_temp.fails($$insert into public.leaderboard_profiles (athlete_id, nickname) values ('b0000000-0000-0000-0000-00000000000b', 'camruns')$$),
  'nicknames are unique regardless of capitals');
insert into public.leaderboard_profiles (athlete_id, nickname) values ('b0000000-0000-0000-0000-00000000000b', 'Bee');
select pg_temp.expect((select count(*) from public.leaderboard_profiles) = 1, 'B sees only their own leaderboard profile');
select pg_temp.expect((select count(*) from public.gyms) = 0, 'B cannot see a gym they are not in');
select pg_temp.expect(pg_temp.fails($$update public.leaderboard_profiles set gym_id = (select id from public.gyms limit 1)$$)
  and pg_temp.fails($$insert into public.leaderboard_profiles (athlete_id, nickname, gym_id) values ('b0000000-0000-0000-0000-00000000000b', 'x', null)$$),
  'gym membership cannot be set directly, only with a join code');
select pg_temp.expect(pg_temp.fails($$select * from public.join_gym('ZZZZZZ')$$), 'a wrong join code is refused');
commit;

-- B joins with A's code (read as the service role, as if A shared it).
select join_code as code from code_a \gset
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.expect((select name from public.join_gym(lower(:'code'))) = 'Ure CrossFit', 'B joins A''s gym with the code (any capitals)');
select pg_temp.expect((select count(*) from public.gyms) = 1, 'B can now see the gym');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
insert into public.leaderboard_profiles (athlete_id, nickname) values ('d0000000-0000-0000-0000-00000000000d', 'Dee');
select pg_temp.expect(pg_temp.fails($$select * from public.leaderboard('gym', 7, current_date)$$), 'without a gym there is no gym leaderboard');
commit;

-- ---------------------------------------------------------------------------------------------
-- What the leaderboard shows
-- ---------------------------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
select pg_temp.expect(pg_temp.fails($$select * from public.leaderboard('world', 7, current_date)$$), 'athletes who have not opted in cannot view the leaderboard');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
create temp table w as select * from public.leaderboard('world', 7, current_date);
select pg_temp.expect((select count(*) from w) = 3 and not exists (select 1 from w where nickname not in ('CamRuns', 'Bee', 'Dee')),
  'the world board lists opted-in athletes only (C is not on it)');
select pg_temp.expect((select completion_pct from w where nickname = 'CamRuns') = 50,
  'plan completion counts planned sessions done (1 of 2; rest days excluded)');
select pg_temp.expect((select days_trained from w where nickname = 'Bee') = 2 and (select completion_pct from w where nickname = 'Bee') is null,
  'days trained counts any logged training; no plan means no completion figure');
select pg_temp.expect((select days_trained from w where nickname = 'Dee') = 0, 'training outside the window does not count');
select pg_temp.expect((select rank from w where nickname = 'CamRuns') = 1 and (select is_me from w where nickname = 'CamRuns'),
  'ranked by completion first, and the caller is marked');
select pg_temp.expect((select count(*) from public.leaderboard('gym', 7, current_date)) = 2, 'the gym board lists only gym members');
select pg_temp.expect(pg_temp.fails($$select * from public.leaderboard('world', 30, current_date)$$)
  and pg_temp.fails($$select * from public.leaderboard('world', 7, current_date + 10)$$),
  'only the 7- and 28-day windows ending today are allowed');
select pg_temp.expect((select (public.export_my_data() -> 'leaderboard_profile' ->> 'nickname')) = 'CamRuns'
  and (select (public.export_my_data() -> 'gym' ->> 'name')) = 'Ure CrossFit',
  'the data export includes the leaderboard profile and gym');
commit;

-- Opting out takes you off the board straight away.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
update public.leaderboard_profiles set opted_in = false;
commit;
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.expect(not exists (select 1 from public.leaderboard('world', 28, current_date) where nickname = 'Bee'), 'opting out removes you from the board');
commit;

begin;
set local role anon;
select pg_temp.expect(pg_temp.fails($$select * from public.leaderboard('world', 7, current_date)$$)
  and pg_temp.fails($$select * from public.leaderboard_profiles$$) and pg_temp.fails($$select * from public.gyms$$),
  'signed-out visitors can read nothing');
commit;

delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.expect(not exists (select 1 from public.leaderboard_profiles where nickname = 'CamRuns'), 'deleting an account removes its leaderboard profile');

\echo 'ALL LEADERBOARD TESTS PASSED'

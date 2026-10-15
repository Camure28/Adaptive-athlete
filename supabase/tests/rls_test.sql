-- Security tests for the Adaptive Athlete schema. Every check raises on failure.
-- Run with: bash supabase/tests/run_rls_tests.sh

\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Fixtures (as the service role: the server creating plans for two athletes)
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.test');

set role service_role;
insert into public.athletes (id, user_id, display_name) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Athlete A'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'Athlete B');
insert into public.hyrox_profiles (athlete_id, level, available_days, max_weekday_minutes, max_weekend_minutes, weekly_run_meters) values
  ('a0000000-0000-0000-0000-00000000000a', 'intermediate', '{0,1,2,3,5}', 60, 120, 25000),
  ('b0000000-0000-0000-0000-00000000000b', 'advanced', '{0,1,2,3,4,5}', 90, 150, 40000);
insert into public.goals (id, athlete_id, kind, event_date, hyrox_division) values
  ('a1000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'hyrox', '2027-02-27', 'men_open'),
  ('b1000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'hyrox', '2027-03-06', 'women_pro');
insert into public.training_plans (id, athlete_id, goal_id) values
  ('a2000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a'),
  ('b2000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-00000000000b');
insert into public.plan_versions (id, plan_id, athlete_id, version, engine_version, basis, reason) values
  ('a3000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 1, 'test', '{}', 'generated'),
  ('b3000000-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 1, 'test', '{}', 'generated');
insert into public.planned_workouts (plan_version_id, athlete_id, workout_key, scheduled_date, sport, session_type, title, estimated_minutes, planned_load, body) values
  ('a3000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'k1', '2026-10-20', 'hyrox', 'compromised_run', 'Compromised run', 45, 300, '{}'),
  ('b3000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'k1', '2026-10-20', 'hyrox', 'compromised_run', 'Compromised run', 50, 350, '{}');
insert into public.adaptation_decisions (plan_id, athlete_id, from_version, rule_id, rule_version, action, outcome, confidence, what_changed, why, next_steps, evidence, changes) values
  ('b2000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 1, 'pain_safety', 1, 'add_recovery', 'applied', 1, 'x', 'y', 'z', '[]', '[]');
insert into public.completed_workouts (athlete_id, workout_date, sport, status, rpe, pain_level) values
  ('b0000000-0000-0000-0000-00000000000b', '2026-10-14', 'run', 'completed', 6, 5);
insert into public.provider_connections (id, athlete_id, provider, status) values
  ('a4000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'coros', 'active');
insert into public.provider_credentials (connection_id, encrypted_access_token, key_version) values
  ('a4000000-0000-0000-0000-00000000000a', '\x00ff', 1);
reset role;

-- ---------------------------------------------------------------------------------------------
-- As athlete A
-- ---------------------------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.expect((select count(*) from public.athletes) = 1, 'A sees exactly one athlete row (their own)');
select pg_temp.expect((select count(*) from public.hyrox_profiles) = 1, 'A sees only their own profile');
select pg_temp.expect(not exists (select 1 from public.goals where id = 'b1000000-0000-0000-0000-00000000000b'),
  'A cannot read B''s goal even by guessing its id');
select pg_temp.expect((select count(*) from public.planned_workouts) = 1, 'A sees only their own planned workouts');
select pg_temp.expect((select count(*) from public.adaptation_decisions) = 0, 'A cannot see B''s adaptation decisions');
select pg_temp.expect((select count(*) from public.completed_workouts) = 0, 'A cannot see B''s logged workouts or pain reports');

-- Writes into another athlete's data
do $$ begin
  insert into public.completed_workouts (athlete_id, workout_date, sport, status)
  values ('b0000000-0000-0000-0000-00000000000b', '2026-10-15', 'run', 'completed');
  raise exception 'FAILED: A inserted a workout into B''s account';
exception when insufficient_privilege then raise notice 'ok - A cannot insert a workout into B''s account';
end $$;

with u as (update public.goals set event_date = '2030-01-01' where id = 'b1000000-0000-0000-0000-00000000000b' returning 1)
select pg_temp.expect((select count(*) from u) = 0, 'A cannot modify B''s goal');

with d as (delete from public.hyrox_profiles where athlete_id = 'b0000000-0000-0000-0000-00000000000b' returning 1)
select pg_temp.expect((select count(*) from d) = 0, 'A cannot delete B''s profile');

do $$ begin
  update public.goals set athlete_id = 'b0000000-0000-0000-0000-00000000000b' where id = 'a1000000-0000-0000-0000-00000000000a';
  raise exception 'FAILED: A moved a goal into B''s account';
exception when insufficient_privilege then raise notice 'ok - A cannot move their own row into B''s account';
end $$;

do $$ begin
  update public.athletes set user_id = 'bbbbbbbb-0000-0000-0000-000000000002' where id = 'a0000000-0000-0000-0000-00000000000a';
  raise exception 'FAILED: athlete row reassigned to another user';
exception when insufficient_privilege then raise notice 'ok - an athlete row cannot be reassigned to another user';
end $$;

-- Linking own records to another athlete's plan (composite foreign key)
do $$ begin
  insert into public.completed_workouts (athlete_id, plan_id, workout_key, workout_date, sport, status)
  values ('a0000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000b', 'k1', '2026-10-20', 'hyrox', 'completed');
  raise exception 'FAILED: A linked a workout to B''s plan';
exception when foreign_key_violation then raise notice 'ok - A cannot link a workout to B''s plan';
end $$;

-- Engine outputs are read-only from the client
do $$ begin
  insert into public.plan_versions (plan_id, athlete_id, version, engine_version, basis, reason)
  values ('a2000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 2, 'forged', '{}', 'adapted');
  raise exception 'FAILED: client wrote a plan version';
exception when insufficient_privilege then raise notice 'ok - A cannot forge a plan version, even for their own plan';
end $$;

do $$ begin
  insert into public.adaptation_decisions (plan_id, athlete_id, from_version, rule_id, rule_version, action, outcome, confidence, what_changed, why, next_steps, evidence, changes)
  values ('a2000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 1, 'fake', 1, 'progress', 'applied', 1, 'x', 'y', 'z', '[]', '[]');
  raise exception 'FAILED: client wrote an adaptation decision';
exception when insufficient_privilege then raise notice 'ok - A cannot forge adaptation history';
end $$;

-- Credentials are invisible
do $$ begin
  perform 1 from public.provider_credentials;
  raise exception 'FAILED: client read provider credentials';
exception when insufficient_privilege then raise notice 'ok - provider credentials are not readable by athletes';
end $$;
select pg_temp.expect((select count(*) from public.provider_connections) = 1, 'A can see their own connection status (no secrets)');

-- Own inputs work, with validation
insert into public.completed_workouts (athlete_id, workout_date, sport, status, rpe)
values ('a0000000-0000-0000-0000-00000000000a', '2026-10-15', 'run', 'completed', 4);
select pg_temp.expect((select count(*) from public.completed_workouts) = 1, 'A can log their own workout');

do $$ begin
  insert into public.completed_workouts (athlete_id, workout_date, sport, status, rpe)
  values ('a0000000-0000-0000-0000-00000000000a', '2026-10-15', 'run', 'completed', 14);
  raise exception 'FAILED: RPE 14 accepted';
exception when check_violation then raise notice 'ok - impossible values (RPE 14) are rejected';
end $$;

-- Consents are append-only
insert into public.consents (athlete_id, kind, granted, policy_version) values ('a0000000-0000-0000-0000-00000000000a', 'health_data_processing', true, 'v1');
do $$ begin
  update public.consents set granted = false;
  raise exception 'FAILED: consent edited';
exception when insufficient_privilege then raise notice 'ok - consent records cannot be edited (only appended)';
end $$;

-- Export contains only A's data
select pg_temp.expect(
  (public.export_my_data() -> 'athlete' ->> 'display_name') = 'Athlete A'
  and jsonb_array_length(public.export_my_data() -> 'goals') = 1
  and public.export_my_data()::text not like '%b0000000-0000-0000-0000-00000000000b%',
  'data export contains only the requesting athlete''s data');
commit;

-- ---------------------------------------------------------------------------------------------
-- Anonymous visitors
-- ---------------------------------------------------------------------------------------------
begin;
set local role anon;
do $$ begin
  perform 1 from public.athletes;
  raise exception 'FAILED: anon read athletes';
exception when insufficient_privilege then raise notice 'ok - signed-out visitors cannot read any athlete data';
end $$;
commit;

-- ---------------------------------------------------------------------------------------------
-- History is append-only even for the server
-- ---------------------------------------------------------------------------------------------
begin;
set local role service_role;
do $$ begin
  update public.plan_versions set basis = '{"tampered": true}' where id = 'a3000000-0000-0000-0000-00000000000a';
  raise exception 'FAILED: plan version edited';
exception when insufficient_privilege then raise notice 'ok - plan versions cannot be edited, even by the server';
end $$;
do $$ begin
  update public.adaptation_decisions set why = 'rewritten';
  raise exception 'FAILED: decision edited';
exception when insufficient_privilege then raise notice 'ok - adaptation decisions cannot be rewritten, even by the server';
end $$;

-- Idempotent imports: the same provider activity can't be stored twice
insert into public.completed_workouts (athlete_id, workout_date, sport, status, source, external_id)
values ('a0000000-0000-0000-0000-00000000000a', '2026-10-13', 'run', 'completed', 'coros', 'act-123');
do $$ begin
  insert into public.completed_workouts (athlete_id, workout_date, sport, status, source, external_id)
  values ('a0000000-0000-0000-0000-00000000000a', '2026-10-13', 'run', 'completed', 'coros', 'act-123');
  raise exception 'FAILED: duplicate import stored';
exception when unique_violation then raise notice 'ok - re-importing the same provider activity is rejected';
end $$;
commit;

-- ---------------------------------------------------------------------------------------------
-- Onboarding save (new user C), atomic and owner-scoped
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000003', 'c@example.test');
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
select public.save_hyrox_onboarding('{
  "units": "mi", "level": "first_timer", "wantsDoubles": null, "gymTypes": ["crossfit"],
  "availableDays": [0,2,3,5], "longDay": 5, "weekdayMinutes": 60, "weekendMinutes": 90, "weeklyRunMeters": 16093,
  "equipment": ["outdoor_run", "rower", "kettlebells"], "limitations": ["jumping"], "limitationNote": "",
  "raceDate": "2027-02-27", "division": "women_open", "targetFinishSeconds": null,
  "results": [{"kind": "run", "date": "2026-09-20", "distanceMeters": 5000, "finishSeconds": 1680, "timing": "self_reported"}],
  "consentHealthData": true, "policyVersion": "v1"
}'::jsonb);
-- Saving again with changed equipment replaces rather than duplicates
select public.save_hyrox_onboarding('{
  "units": "km", "level": "first_timer", "wantsDoubles": null, "gymTypes": ["crossfit"],
  "availableDays": [0,2,3,5], "longDay": 5, "weekdayMinutes": 60, "weekendMinutes": 90, "weeklyRunMeters": 16093,
  "equipment": ["outdoor_run", "rower"], "limitations": [], "limitationNote": "",
  "raceDate": "2027-03-06", "division": "women_open", "targetFinishSeconds": 5400,
  "results": [{"kind": "run", "date": "2026-09-20", "distanceMeters": 5000, "finishSeconds": 1680, "timing": "self_reported"}],
  "consentHealthData": true, "policyVersion": "v1"
}'::jsonb);
select pg_temp.expect((select count(*) from public.athletes) = 1 and (select units from public.athletes) = 'km',
  'onboarding creates one athlete for the signed-in user and updates it on re-save');
select pg_temp.expect((select count(*) from public.athlete_equipment) = 2, 're-saving replaces the equipment list');
select pg_temp.expect((select count(*) from public.athlete_limitations) = 0, 're-saving replaces limitations');
select pg_temp.expect((select count(*) from public.goals) = 1 and (select event_date from public.goals) = '2027-03-06',
  're-saving updates the active goal instead of adding another');
select pg_temp.expect((select count(*) from public.race_results) = 1, 're-saving does not duplicate results');
select pg_temp.expect((select count(*) from public.consents) = 1, 'consent is recorded once per policy version');
do $$ begin
  perform public.save_hyrox_onboarding('{"units":"mi","level":"elite","availableDays":[0],"weekdayMinutes":60,"weekendMinutes":60,"weeklyRunMeters":0,"equipment":[],"limitations":[],"raceDate":"2027-01-01","division":"women_open"}'::jsonb);
  raise exception 'FAILED: invalid level saved';
exception when check_violation then raise notice 'ok - invalid onboarding answers are rejected as a whole';
end $$;
select pg_temp.expect((select level from public.hyrox_profiles) = 'first_timer', 'a rejected save leaves the previous answers intact');
commit;

begin;
set local role anon;
do $$ begin
  perform public.save_hyrox_onboarding('{}'::jsonb);
  raise exception 'FAILED: anon saved onboarding';
exception when insufficient_privilege then raise notice 'ok - signed-out visitors cannot save onboarding';
end $$;
commit;

-- ---------------------------------------------------------------------------------------------
-- Account deletion removes everything for that athlete and nothing else
-- ---------------------------------------------------------------------------------------------
delete from auth.users where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.expect(
  (select count(*) from public.athletes where id = 'b0000000-0000-0000-0000-00000000000b') = 0
  and (select count(*) from public.plan_versions where athlete_id = 'b0000000-0000-0000-0000-00000000000b') = 0
  and (select count(*) from public.adaptation_decisions where athlete_id = 'b0000000-0000-0000-0000-00000000000b') = 0
  and (select count(*) from public.completed_workouts where athlete_id = 'b0000000-0000-0000-0000-00000000000b') = 0,
  'deleting an account removes all of that athlete''s data, history included');
select pg_temp.expect((select count(*) from public.athletes) = 2, 'other athletes are untouched by a deletion');

\echo 'ALL SECURITY TESTS PASSED'

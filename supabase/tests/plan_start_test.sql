-- Plan start day saved at onboarding (plan_start_date). Every check raises on failure.
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.test');

begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select public.save_hyrox_onboarding(jsonb_build_object(
  'units', 'mi', 'level', 'first_timer', 'gymTypes', '["crossfit"]'::jsonb,
  'availableDays', '[0,2,4]'::jsonb, 'weekdayMinutes', 60, 'weekendMinutes', 90, 'weeklyRunMeters', 16093,
  'equipment', '["outdoor_run"]'::jsonb, 'limitations', '[]'::jsonb, 'limitationNote', '',
  'raceDate', '2027-02-27', 'division', 'women_open', 'results', '[]'::jsonb,
  'planStartDate', current_date::text, 'consentHealthData', true));
select pg_temp.expect((select plan_start_date from public.hyrox_profiles) = current_date, 'the chosen start day is saved');

select public.save_hyrox_onboarding(jsonb_build_object(
  'units', 'mi', 'level', 'first_timer', 'gymTypes', '["crossfit"]'::jsonb,
  'availableDays', '[0,2,4]'::jsonb, 'weekdayMinutes', 60, 'weekendMinutes', 90, 'weeklyRunMeters', 16093,
  'equipment', '["outdoor_run"]'::jsonb, 'limitations', '[]'::jsonb, 'limitationNote', '',
  'raceDate', '2027-02-27', 'division', 'women_open', 'results', '[]'::jsonb, 'consentHealthData', true));
select pg_temp.expect((select plan_start_date from public.hyrox_profiles) is null, 'no start day saved means next Monday (null), as before');

do $$ begin
  perform public.save_hyrox_onboarding(jsonb_build_object(
    'units', 'mi', 'level', 'first_timer', 'availableDays', '[0]'::jsonb, 'weekdayMinutes', 60, 'weekendMinutes', 60,
    'weeklyRunMeters', 0, 'equipment', '[]'::jsonb, 'limitations', '[]'::jsonb, 'raceDate', '2027-02-27',
    'division', 'women_open', 'planStartDate', (current_date + 90)::text));
  raise exception 'FAILED: a start day 3 months away was saved';
exception when check_violation then raise notice 'ok - a start day more than a month away is rejected';
end $$;
commit;

\echo 'ALL PLAN START TESTS PASSED'

-- Training status (product owner 2026-10-16): where the athlete's training is right now.
-- Sets where the plan starts: building (full base), consistent (2 base weeks), race_ready (no base).
-- Nullable: athletes onboarded before this question are treated as "building" (the cautious start).

alter table public.hyrox_profiles
  add column if not exists training_status text
    check (training_status in ('building', 'consistent', 'race_ready'));

-- save_hyrox_onboarding, now also saving training_status. Otherwise identical to 20261015000002.
create or replace function public.save_hyrox_onboarding(p jsonb) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  aid uuid;
  gid uuid;
  b   jsonb;
begin
  if uid is null then
    raise exception 'Sign in to save your answers' using errcode = 'insufficient_privilege';
  end if;

  insert into athletes (user_id, units) values (uid, coalesce(p ->> 'units', 'mi'))
  on conflict (user_id) do update set units = excluded.units
  returning id into aid;

  insert into hyrox_profiles (athlete_id, level, wants_doubles, gym_types, available_days, long_session_day,
                              max_weekday_minutes, max_weekend_minutes, weekly_run_meters, training_status)
  values (aid,
          p ->> 'level',
          (p ->> 'wantsDoubles')::boolean,
          coalesce(array(select jsonb_array_elements_text(p -> 'gymTypes')), '{}'),
          array(select (jsonb_array_elements_text(p -> 'availableDays'))::smallint),
          (p ->> 'longDay')::smallint,
          (p ->> 'weekdayMinutes')::smallint,
          (p ->> 'weekendMinutes')::smallint,
          (p ->> 'weeklyRunMeters')::integer,
          p ->> 'trainingStatus')
  on conflict (athlete_id) do update set
    level = excluded.level, wants_doubles = excluded.wants_doubles, gym_types = excluded.gym_types,
    available_days = excluded.available_days, long_session_day = excluded.long_session_day,
    max_weekday_minutes = excluded.max_weekday_minutes, max_weekend_minutes = excluded.max_weekend_minutes,
    weekly_run_meters = excluded.weekly_run_meters, training_status = excluded.training_status;

  delete from athlete_equipment where athlete_id = aid;
  insert into athlete_equipment (athlete_id, equipment)
  select aid, e from jsonb_array_elements_text(p -> 'equipment') e;

  delete from athlete_limitations where athlete_id = aid;
  insert into athlete_limitations (athlete_id, movement, note)
  select aid, m, case when row_number() over () = 1 then nullif(p ->> 'limitationNote', '') end
  from jsonb_array_elements_text(p -> 'limitations') m;
  if jsonb_array_length(coalesce(p -> 'limitations', '[]')) = 0 and coalesce(p ->> 'limitationNote', '') <> '' then
    insert into athlete_limitations (athlete_id, movement, note) values (aid, 'other', p ->> 'limitationNote');
  end if;

  -- One active HYROX goal: update it if present, otherwise create it.
  select id into gid from goals where athlete_id = aid and kind = 'hyrox' and status = 'active' order by created_at desc limit 1;
  if gid is null then
    insert into goals (athlete_id, kind, event_date, hyrox_division, target_finish_seconds)
    values (aid, 'hyrox', (p ->> 'raceDate')::date, p ->> 'division', (p ->> 'targetFinishSeconds')::integer)
    returning id into gid;
  else
    update goals set event_date = (p ->> 'raceDate')::date, hyrox_division = p ->> 'division',
                     target_finish_seconds = (p ->> 'targetFinishSeconds')::integer
    where id = gid;
  end if;

  -- Results: insert unless an identical one is already stored (re-saving is harmless).
  for b in select * from jsonb_array_elements(coalesce(p -> 'results', '[]')) loop
    insert into race_results (athlete_id, kind, event_date, distance_meters, finish_seconds, timing, hyrox_division)
    select aid, b ->> 'kind', (b ->> 'date')::date, (b ->> 'distanceMeters')::numeric, (b ->> 'finishSeconds')::integer,
           b ->> 'timing', b ->> 'division'
    where not exists (
      select 1 from race_results r
      where r.athlete_id = aid and r.kind = b ->> 'kind' and r.event_date = (b ->> 'date')::date
        and r.finish_seconds = (b ->> 'finishSeconds')::integer);
  end loop;

  if (p ->> 'consentHealthData')::boolean then
    insert into consents (athlete_id, kind, granted, policy_version)
    select aid, 'health_data_processing', true, coalesce(p ->> 'policyVersion', 'v1')
    where not exists (select 1 from consents c where c.athlete_id = aid and c.kind = 'health_data_processing'
                      and c.granted and c.policy_version = coalesce(p ->> 'policyVersion', 'v1'));
  end if;

  return aid;
end $$;

revoke all on function public.save_hyrox_onboarding(jsonb) from public;
revoke execute on function public.save_hyrox_onboarding(jsonb) from anon;
grant execute on function public.save_hyrox_onboarding(jsonb) to authenticated;

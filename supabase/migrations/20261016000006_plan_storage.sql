-- Plan storage (D-022): generated plans are saved as immutable versions so adaptation has a history.
-- Plans are written only by the generate-plan Edge Function (service role) through
-- record_plan_version, so an athlete can read their plan but never write or forge one.

-- What each version needs to be shown and explained later. The tables are still empty on the live
-- project (checked before this migration was pushed), so the new columns can be required.
alter table public.plan_versions
  add column starts_on date not null,              -- first week generated in this version; earlier sessions are carried over
  add column weeks     jsonb not null,             -- per week: start date, phase, recovery flag, run target
  add column inputs    jsonb not null;             -- the exact engine inputs (athlete and goal), so any version can be reproduced

-- Order of sessions within a day, as the engine produced them.
alter table public.planned_workouts
  add column position integer not null check (position >= 0);

-- One active plan per goal.
create unique index training_plans_one_active_per_goal on public.training_plans (goal_id) where status = 'active';

-- Saves a new version of the athlete's plan for a goal in one transaction: creates the plan if
-- needed (version 1, 'generated'), otherwise adds the next version ('regenerated'). Sessions and
-- weeks before p_starts_on are carried over unchanged from the previous version, so a week in
-- progress never changes (product owner 2026-10-16). Returns {plan_id, version}.
create or replace function public.record_plan_version(
  p_athlete_id     uuid,
  p_goal_id        uuid,
  p_engine_version text,
  p_starts_on      date,
  p_basis          jsonb,
  p_weeks          jsonb,
  p_inputs         jsonb,
  p_workouts       jsonb
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  pid     uuid;
  cur     integer;
  prev_id uuid;
  vid     uuid;
  ver     integer;
begin
  if not exists (select 1 from goals where id = p_goal_id and athlete_id = p_athlete_id) then
    raise exception 'Goal % does not belong to athlete %', p_goal_id, p_athlete_id using errcode = 'foreign_key_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_workouts) w where (w ->> 'scheduled_date')::date < p_starts_on)
     or exists (select 1 from jsonb_array_elements(p_weeks) w where (w ->> 'startDate')::date < p_starts_on) then
    raise exception 'New sessions must start on or after %', p_starts_on using errcode = 'check_violation';
  end if;

  select id, current_version into pid, cur
  from training_plans
  where athlete_id = p_athlete_id and goal_id = p_goal_id and status = 'active'
  for update;

  if pid is null then
    insert into training_plans (athlete_id, goal_id) values (p_athlete_id, p_goal_id) returning id into pid;
    ver := 1;
  else
    select id into prev_id from plan_versions where plan_id = pid and version = cur;
    ver := cur + 1;
  end if;

  insert into plan_versions (plan_id, athlete_id, version, engine_version, basis, reason, starts_on, weeks, inputs)
  values (
    pid, p_athlete_id, ver, p_engine_version, p_basis,
    case when ver = 1 then 'generated' else 'regenerated' end,
    p_starts_on,
    coalesce((select jsonb_agg(w order by w ->> 'startDate')
              from plan_versions pv, jsonb_array_elements(pv.weeks) w
              where pv.id = prev_id and (w ->> 'startDate')::date < p_starts_on), '[]'::jsonb) || p_weeks,
    p_inputs)
  returning id into vid;

  insert into planned_workouts (plan_version_id, athlete_id, workout_key, scheduled_date, position, sport, session_type,
                                title, estimated_minutes, planned_meters, planned_load, adapted_by_rule, body)
  select vid, athlete_id, workout_key, scheduled_date, position, sport, session_type,
         title, estimated_minutes, planned_meters, planned_load, adapted_by_rule, body
  from planned_workouts
  where plan_version_id = prev_id and scheduled_date < p_starts_on;

  insert into planned_workouts (plan_version_id, athlete_id, workout_key, scheduled_date, position, sport, session_type,
                                title, estimated_minutes, planned_meters, planned_load, adapted_by_rule, body)
  select vid, p_athlete_id, w ->> 'workout_key', (w ->> 'scheduled_date')::date, (w ->> 'position')::integer,
         w ->> 'sport', w ->> 'session_type', w ->> 'title', (w ->> 'estimated_minutes')::smallint,
         (w ->> 'planned_meters')::integer, (w ->> 'planned_load')::integer, w ->> 'adapted_by_rule', w -> 'body'
  from jsonb_array_elements(p_workouts) w;

  update training_plans set current_version = ver where id = pid;
  return jsonb_build_object('plan_id', pid, 'version', ver);
end $$;

-- Server only: Supabase grants new functions to anon and authenticated by default.
revoke all on function public.record_plan_version(uuid, uuid, text, date, jsonb, jsonb, jsonb, jsonb) from public;
revoke execute on function public.record_plan_version(uuid, uuid, text, date, jsonb, jsonb, jsonb, jsonb) from anon, authenticated;
grant execute on function public.record_plan_version(uuid, uuid, text, date, jsonb, jsonb, jsonb, jsonb) to service_role;

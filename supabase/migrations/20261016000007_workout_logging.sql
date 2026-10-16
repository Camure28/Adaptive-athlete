-- Workout logging (D-025): manual logs and imports share completed_workouts, in the engine's
-- CompletedWorkout shape (packages/engine/src/imports/, packages/engine/src/store/logs.ts).
-- The table had no rows when this was pushed (checked), so tightening the scales is safe.

-- Import columns listed in docs/INTEGRATIONS.md ("Still to build"). Manual logs leave them empty.
alter table public.completed_workouts
  add column started_at            timestamptz,
  add column ended_at              timestamptz,
  add column origin_app            text check (char_length(origin_app) <= 100),   -- the app that recorded it, e.g. Garmin Connect
  add column device                text check (char_length(device) <= 100),
  add column elevation_gain_meters integer check (elevation_gain_meters between 0 and 10000),
  add column active_energy_kcal    integer check (active_energy_kcal between 0 and 20000),
  add constraint completed_workouts_times_check check (ended_at is null or started_at is null or ended_at >= started_at);

-- Pain details read by rule S-2 (product owner 2026-10-16). pain_location holds the athlete's
-- chosen area (LOG_BODY_AREAS); the engine maps it to the approved pain-map groups (D-024).
alter table public.completed_workouts
  add column pain_sharp           boolean,
  add column pain_stopped_session boolean;

-- Fatigue and soreness are 1–5 (product owner 2026-10-16), matching rule F-5 ("≥ 4/5").
-- RPE and pain stay 0–10.
alter table public.completed_workouts
  drop constraint completed_workouts_fatigue_check,
  drop constraint completed_workouts_soreness_check,
  add constraint completed_workouts_fatigue_check check (fatigue between 1 and 5),
  add constraint completed_workouts_soreness_check check (soreness between 1 and 5);

-- One log per planned session; logging it again edits that log. workout_key is stable across plan
-- versions, so a log stays attached when the plan is rebuilt.
create unique index completed_workouts_planned_idx on public.completed_workouts (plan_id, workout_key)
  where plan_id is not null and workout_key is not null;

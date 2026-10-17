-- Adaptive Athlete database setup. Generated from supabase/migrations by build_setup_sql.sh.
-- Run once on a new, empty Supabase project (SQL Editor → New query → paste → Run).
begin;

-- ===== migrations/20261015000001_init.sql =====
-- Adaptive Athlete — initial schema (Supabase-compatible PostgreSQL 15+).
--
-- Security model (docs/SECURITY.md):
--   * Every athlete-owned row carries athlete_id; row-level security limits access to the owner,
--     resolved from the signed-in user (auth.uid()). The app cannot bypass this by changing an ID.
--   * Athletes write their own INPUTS (profile, goals, results, logged workouts, recovery, consents).
--     Engine OUTPUTS (plans, plan versions, workouts, adaptation decisions) are written only by the
--     server (service role), so an athlete's history can't be forged from the client.
--   * Plan versions, planned workouts, adaptation decisions, consents and audit records are
--     append-only: UPDATE is blocked for everyone. Rows are removed only when the account is deleted.
--   * Provider OAuth credentials live in a separate table with no client access at all.
--   * Child rows use composite foreign keys (parent_id, athlete_id) so a row can never point at
--     another athlete's parent record.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.forbid_update() returns trigger
language plpgsql as $$
begin
  raise exception 'Rows in % are append-only', tg_table_name using errcode = 'insufficient_privilege';
end $$;

-- ---------------------------------------------------------------------------------------------
-- Athletes and profile
-- ---------------------------------------------------------------------------------------------

create table public.athletes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  units        text not null default 'mi' check (units in ('mi', 'km')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- SECURITY DEFINER so policies can check ownership without recursive RLS. search_path is pinned.
create or replace function public.owns_athlete(a uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.athletes where id = a and user_id = auth.uid());
$$;
revoke all on function public.owns_athlete(uuid) from public;
grant execute on function public.owns_athlete(uuid) to authenticated, service_role;

create table public.hyrox_profiles (
  athlete_id            uuid primary key references public.athletes (id) on delete cascade,
  level                 text not null check (level in ('first_timer', 'intermediate', 'advanced', 'competitive')),
  wants_doubles         boolean,
  gym_types             text[] not null default '{}'
                          check (gym_types <@ array['home', 'crossfit', 'commercial', 'hyrox_club']),
  available_days        smallint[] not null
                          check (array_length(available_days, 1) between 1 and 7 and available_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  long_session_day      smallint check (long_session_day between 0 and 6),
  max_weekday_minutes   smallint not null check (max_weekday_minutes between 15 and 300),
  max_weekend_minutes   smallint not null check (max_weekend_minutes between 15 and 360),
  weekly_run_meters     integer not null check (weekly_run_meters between 0 and 300000),
  weekly_run_source     text not null default 'user_reported' check (weekly_run_source in ('user_reported', 'calculated')),
  updated_at            timestamptz not null default now()
);

create table public.athlete_equipment (
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  equipment  text not null check (equipment in (
    'outdoor_run', 'treadmill', 'curved_treadmill', 'skierg', 'rower', 'bike_erg', 'sled', 'turf_lane',
    'plates', 'barbell_rack', 'dumbbells', 'kettlebells', 'cable_machine', 'battle_rope', 'wall_ball',
    'sandbag', 'open_floor')),
  primary key (athlete_id, equipment)
);

-- Movements to avoid. Deliberately no diagnosis or injury fields (data minimisation).
create table public.athlete_limitations (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  movement   text not null check (char_length(movement) between 1 and 60),
  note       text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  unique (athlete_id, movement)
);

create table public.preferences (
  athlete_id    uuid primary key references public.athletes (id) on delete cascade,
  notifications jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Goals and results
-- ---------------------------------------------------------------------------------------------

create table public.goals (
  id                    uuid primary key default gen_random_uuid(),
  athlete_id            uuid not null references public.athletes (id) on delete cascade,
  kind                  text not null check (kind in ('hyrox', 'race')),
  event_date            date not null,
  hyrox_division        text check (hyrox_division in ('women_open', 'women_pro', 'men_open', 'men_pro')),
  race_distance         text check (race_distance in ('5k', '10k', 'half_marathon', 'marathon')),
  target_finish_seconds integer check (target_finish_seconds > 0),
  priority              text not null default 'A' check (priority in ('A', 'B', 'C')),
  status                text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, athlete_id),
  check ((kind = 'hyrox') = (hyrox_division is not null)),
  check ((kind = 'race') = (race_distance is not null))
);
create index goals_athlete_idx on public.goals (athlete_id, event_date);

create table public.race_results (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null references public.athletes (id) on delete cascade,
  kind            text not null check (kind in ('run', 'hyrox')),
  event_date      date not null,
  distance_meters numeric(8, 1) check (distance_meters > 0),
  finish_seconds  integer not null check (finish_seconds > 0),
  timing          text not null check (timing in ('official', 'device', 'self_reported')),
  hyrox_division  text check (hyrox_division in ('women_open', 'women_pro', 'men_open', 'men_pro')),
  conditions      jsonb not null default '{}'::jsonb,
  splits          jsonb,
  source          text not null default 'manual',
  created_at      timestamptz not null default now(),
  check (kind <> 'run' or distance_meters is not null),
  check (event_date <= current_date + 1)
);
create index race_results_athlete_idx on public.race_results (athlete_id, event_date desc);

-- Estimated/calculated fitness metrics with provenance (never shown as measured).
create table public.fitness_assessments (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.athletes (id) on delete cascade,
  metric      text not null check (metric in ('vdot', 'threshold_pace', 'easy_pace', 'resting_hr_baseline', 'hrv_baseline')),
  value       numeric not null,
  value_kind  text not null check (value_kind in ('measured', 'user_reported', 'calculated', 'estimated')),
  confidence  numeric(3, 2) not null check (confidence between 0 and 1),
  source      text not null,
  observed_at timestamptz not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index fitness_assessments_idx on public.fitness_assessments (athlete_id, metric, observed_at desc);

-- ---------------------------------------------------------------------------------------------
-- Plans (engine output; server-written, append-only versions)
-- ---------------------------------------------------------------------------------------------

create table public.training_plans (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null references public.athletes (id) on delete cascade,
  goal_id         uuid not null,
  current_version integer not null default 1 check (current_version >= 1),
  status          text not null default 'active' check (status in ('active', 'archived')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, athlete_id),
  foreign key (goal_id, athlete_id) references public.goals (id, athlete_id) on delete cascade
);
create index training_plans_athlete_idx on public.training_plans (athlete_id, status);

create table public.plan_versions (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null,
  athlete_id     uuid not null,
  version        integer not null check (version >= 1),
  engine_version text not null,
  basis          jsonb not null,   -- fitness basis with provenance, notes shown to the athlete
  reason         text not null check (reason in ('generated', 'adapted', 'regenerated')),
  created_at     timestamptz not null default now(),
  unique (plan_id, version),
  unique (id, athlete_id),
  foreign key (plan_id, athlete_id) references public.training_plans (id, athlete_id) on delete cascade
);

-- One row per session per version. Steps are stored as the engine's validated JSON structure
-- (warm-up, work, stations with recommended/alternative options, targets). See DATA_MODEL.md.
create table public.planned_workouts (
  id                 uuid primary key default gen_random_uuid(),
  plan_version_id    uuid not null,
  athlete_id         uuid not null,
  workout_key        text not null,  -- stable across versions, links original and revised sessions
  scheduled_date     date not null,
  sport              text not null,
  session_type       text not null,
  title              text not null,
  estimated_minutes  smallint not null check (estimated_minutes >= 0),
  planned_meters     integer check (planned_meters >= 0),
  planned_load       integer not null check (planned_load >= 0),
  adapted_by_rule    text,
  body               jsonb not null,   -- objective, rationale, steps, scaling, substitutions
  unique (plan_version_id, workout_key),
  foreign key (plan_version_id, athlete_id) references public.plan_versions (id, athlete_id) on delete cascade
);
create index planned_workouts_date_idx on public.planned_workouts (athlete_id, scheduled_date);

create table public.adaptation_decisions (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid not null,
  athlete_id        uuid not null,
  from_version      integer not null,
  to_version        integer,          -- null when nothing changed (keep / ask / suppressed)
  rule_id           text not null,
  rule_version      integer not null,
  action            text not null check (action in ('keep', 'progress', 'reduce_intensity', 'reduce_volume',
                      'replace_easier', 'reschedule', 'add_recovery', 'recalculate_targets', 'reassess_block', 'ask_clarification')),
  outcome           text not null check (outcome in ('applied', 'suppressed')),
  suppressed_reason text,
  confidence        numeric(3, 2) not null check (confidence between 0 and 1),
  what_changed      text not null,
  why               text not null,
  next_steps        text not null,
  question          text,
  evidence          jsonb not null,   -- signals, sources, referenced record ids
  changes           jsonb not null,   -- before/after per workout
  created_at        timestamptz not null default now(),
  check ((outcome = 'suppressed') = (suppressed_reason is not null)),
  foreign key (plan_id, athlete_id) references public.training_plans (id, athlete_id) on delete cascade
);
create index adaptation_decisions_idx on public.adaptation_decisions (athlete_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Logged training and recovery (athlete input)
-- ---------------------------------------------------------------------------------------------

create table public.completed_workouts (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references public.athletes (id) on delete cascade,
  plan_id           uuid,
  workout_key       text,             -- which planned session this fulfils, if any
  workout_date      date not null,
  sport             text not null,
  status            text not null check (status in ('completed', 'partial', 'skipped')),
  source            text not null default 'manual'
                      check (source in ('manual', 'file_import', 'apple_health', 'garmin', 'coros', 'strava', 'whoop', 'oura', 'polar', 'google_health')),
  external_id       text,             -- provider activity id; makes imports idempotent
  duration_seconds  integer check (duration_seconds between 0 and 86400),
  distance_meters   integer check (distance_meters between 0 and 500000),
  avg_heart_rate    smallint check (avg_heart_rate between 25 and 250),
  max_heart_rate    smallint check (max_heart_rate between 25 and 250),
  rpe               numeric(3, 1) check (rpe between 0 and 10),
  soreness          smallint check (soreness between 0 and 10),
  fatigue           smallint check (fatigue between 0 and 10),
  pain_level        smallint check (pain_level between 0 and 10),
  pain_location     text check (char_length(pain_location) <= 60),
  pain_altered_movement boolean,
  splits            jsonb,            -- run splits with planned step index
  station_results   jsonb,            -- HYROX station times, option used (real or substitute)
  notes             text check (char_length(notes) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (max_heart_rate is null or avg_heart_rate is null or max_heart_rate >= avg_heart_rate),
  check (source = 'manual' or source = 'file_import' or external_id is not null),
  -- Deleting a plan keeps the athlete's logged history; workout_key stays as a historical label.
  foreign key (plan_id, athlete_id) references public.training_plans (id, athlete_id) on delete set null (plan_id)
);
create unique index completed_workouts_import_idx on public.completed_workouts (athlete_id, source, external_id) where external_id is not null;
create index completed_workouts_date_idx on public.completed_workouts (athlete_id, workout_date desc);

create table public.daily_recovery (
  athlete_id  uuid not null references public.athletes (id) on delete cascade,
  day         date not null,
  source      text not null,
  hrv_ms      numeric(5, 1) check (hrv_ms between 1 and 400),
  resting_hr  smallint check (resting_hr between 20 and 150),
  sleep_hours numeric(4, 2) check (sleep_hours between 0 and 24),
  created_at  timestamptz not null default now(),
  primary key (athlete_id, day, source)   -- never mix devices into one baseline
);

-- ---------------------------------------------------------------------------------------------
-- Integrations
-- ---------------------------------------------------------------------------------------------

create table public.provider_connections (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.athletes (id) on delete cascade,
  provider     text not null check (provider in ('apple_health', 'garmin', 'coros', 'strava', 'whoop', 'oura', 'polar', 'google_health')),
  status       text not null check (status in ('active', 'revoked', 'error', 'disconnected')),
  scopes       text[] not null default '{}',
  last_sync_at timestamptz,
  last_error   text,
  sync_cursor  jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (athlete_id, provider)
);

-- Encrypted at the application layer before insert. No client role can see this table.
create table public.provider_credentials (
  connection_id           uuid primary key references public.provider_connections (id) on delete cascade,
  encrypted_access_token  bytea not null,
  encrypted_refresh_token bytea,
  key_version             smallint not null,
  expires_at              timestamptz,
  updated_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Consent and audit (append-only)
-- ---------------------------------------------------------------------------------------------

create table public.consents (
  id             uuid primary key default gen_random_uuid(),
  athlete_id     uuid not null references public.athletes (id) on delete cascade,
  kind           text not null check (kind in ('terms', 'health_data_processing', 'ai_explanations', 'provider_data')),
  granted        boolean not null,
  policy_version text not null,
  created_at     timestamptz not null default now()
);
create index consents_idx on public.consents (athlete_id, kind, created_at desc);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  athlete_id uuid references public.athletes (id) on delete cascade,
  actor      text not null check (actor in ('athlete', 'engine', 'system', 'support')),
  action     text not null,
  entity     text not null,
  entity_id  text,
  detail     jsonb not null default '{}'::jsonb,   -- never health values, tokens or free text
  created_at timestamptz not null default now()
);
create index audit_log_idx on public.audit_log (athlete_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------

create trigger athletes_updated before update on public.athletes for each row execute function public.set_updated_at();
create trigger hyrox_profiles_updated before update on public.hyrox_profiles for each row execute function public.set_updated_at();
create trigger preferences_updated before update on public.preferences for each row execute function public.set_updated_at();
create trigger goals_updated before update on public.goals for each row execute function public.set_updated_at();
create trigger training_plans_updated before update on public.training_plans for each row execute function public.set_updated_at();
create trigger completed_workouts_updated before update on public.completed_workouts for each row execute function public.set_updated_at();
create trigger provider_connections_updated before update on public.provider_connections for each row execute function public.set_updated_at();

create trigger plan_versions_append_only before update on public.plan_versions for each row execute function public.forbid_update();
create trigger planned_workouts_append_only before update on public.planned_workouts for each row execute function public.forbid_update();
create trigger adaptation_decisions_append_only before update on public.adaptation_decisions for each row execute function public.forbid_update();
create trigger consents_append_only before update on public.consents for each row execute function public.forbid_update();
create trigger audit_log_append_only before update on public.audit_log for each row execute function public.forbid_update();

-- An athlete row can never be moved to a different user.
create or replace function public.forbid_owner_change() returns trigger
language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'athletes.user_id cannot change' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger athletes_owner_fixed before update on public.athletes for each row execute function public.forbid_owner_change();

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table public.athletes             enable row level security;
alter table public.hyrox_profiles       enable row level security;
alter table public.athlete_equipment    enable row level security;
alter table public.athlete_limitations  enable row level security;
alter table public.preferences          enable row level security;
alter table public.goals                enable row level security;
alter table public.race_results         enable row level security;
alter table public.fitness_assessments  enable row level security;
alter table public.training_plans       enable row level security;
alter table public.plan_versions        enable row level security;
alter table public.planned_workouts     enable row level security;
alter table public.adaptation_decisions enable row level security;
alter table public.completed_workouts   enable row level security;
alter table public.daily_recovery       enable row level security;
alter table public.provider_connections enable row level security;
alter table public.provider_credentials enable row level security;
alter table public.consents             enable row level security;
alter table public.audit_log            enable row level security;

-- Start from nothing; grant explicitly below.
revoke all on all tables in schema public from anon, authenticated;

-- Athlete row: read/update own, create one for themselves.
grant select, insert, update on public.athletes to authenticated;
create policy athletes_select on public.athletes for select to authenticated using (user_id = auth.uid());
create policy athletes_insert on public.athletes for insert to authenticated with check (user_id = auth.uid());
create policy athletes_update on public.athletes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Athlete-owned inputs: full CRUD on own rows.
do $$
declare t text;
begin
  foreach t in array array['hyrox_profiles', 'athlete_equipment', 'athlete_limitations', 'preferences', 'goals',
                           'race_results', 'completed_workouts', 'daily_recovery']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.owns_athlete(athlete_id)) with check (public.owns_athlete(athlete_id))', t || '_own', t);
  end loop;
end $$;

-- Engine outputs and integration state: read-only for the owner; written by the server.
do $$
declare t text;
begin
  foreach t in array array['fitness_assessments', 'training_plans', 'plan_versions', 'planned_workouts',
                           'adaptation_decisions', 'provider_connections', 'audit_log']
  loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.owns_athlete(athlete_id))', t || '_read', t);
  end loop;
end $$;

-- Consents: owner can read and append (never edit or delete).
grant select, insert on public.consents to authenticated;
create policy consents_read on public.consents for select to authenticated using (public.owns_athlete(athlete_id));
create policy consents_append on public.consents for insert to authenticated with check (public.owns_athlete(athlete_id));

-- provider_credentials: no grants, no policies. Only the service role (bypasses RLS) can touch it.
revoke all on public.provider_credentials from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Data export (runs as the caller, so RLS limits it to their own rows)
-- ---------------------------------------------------------------------------------------------

create or replace function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'exported_at', now(),
    'athlete', (select to_jsonb(a) from athletes a),
    'hyrox_profile', (select to_jsonb(p) from hyrox_profiles p),
    'equipment', coalesce((select jsonb_agg(e.equipment) from athlete_equipment e), '[]'),
    'limitations', coalesce((select jsonb_agg(to_jsonb(l)) from athlete_limitations l), '[]'),
    'goals', coalesce((select jsonb_agg(to_jsonb(g)) from goals g), '[]'),
    'race_results', coalesce((select jsonb_agg(to_jsonb(r)) from race_results r), '[]'),
    'completed_workouts', coalesce((select jsonb_agg(to_jsonb(c)) from completed_workouts c), '[]'),
    'daily_recovery', coalesce((select jsonb_agg(to_jsonb(d)) from daily_recovery d), '[]'),
    'training_plans', coalesce((select jsonb_agg(to_jsonb(t)) from training_plans t), '[]'),
    'plan_versions', coalesce((select jsonb_agg(to_jsonb(v)) from plan_versions v), '[]'),
    'planned_workouts', coalesce((select jsonb_agg(to_jsonb(w)) from planned_workouts w), '[]'),
    'adaptation_decisions', coalesce((select jsonb_agg(to_jsonb(x)) from adaptation_decisions x), '[]'),
    'consents', coalesce((select jsonb_agg(to_jsonb(k)) from consents k), '[]'),
    'provider_connections', coalesce((select jsonb_agg(to_jsonb(pc) - 'sync_cursor') from provider_connections pc), '[]')
  );
$$;
revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;

-- ===== migrations/20261015000002_save_onboarding.sql =====
-- Saves HYROX onboarding answers atomically for the signed-in user.
-- SECURITY INVOKER: runs with the caller's rights, so every row-level-security rule still applies.
-- The payload shape is produced by apps/mobile/src/onboarding/model.ts (toSavePayload).

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
                              max_weekday_minutes, max_weekend_minutes, weekly_run_meters)
  values (aid,
          p ->> 'level',
          (p ->> 'wantsDoubles')::boolean,
          coalesce(array(select jsonb_array_elements_text(p -> 'gymTypes')), '{}'),
          array(select (jsonb_array_elements_text(p -> 'availableDays'))::smallint),
          (p ->> 'longDay')::smallint,
          (p ->> 'weekdayMinutes')::smallint,
          (p ->> 'weekendMinutes')::smallint,
          (p ->> 'weeklyRunMeters')::integer)
  on conflict (athlete_id) do update set
    level = excluded.level, wants_doubles = excluded.wants_doubles, gym_types = excluded.gym_types,
    available_days = excluded.available_days, long_session_day = excluded.long_session_day,
    max_weekday_minutes = excluded.max_weekday_minutes, max_weekend_minutes = excluded.max_weekend_minutes,
    weekly_run_meters = excluded.weekly_run_meters;

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
grant execute on function public.save_hyrox_onboarding(jsonb) to authenticated;

-- ===== migrations/20261015000003_function_grants.sql =====
-- Supabase grants EXECUTE on new public functions to anon and authenticated by default.
-- Our functions already refuse signed-out callers, but remove the grant so they can't be called at all.
revoke execute on function public.owns_athlete(uuid) from anon;
revoke execute on function public.export_my_data() from anon;
revoke execute on function public.save_hyrox_onboarding(jsonb) from anon;
revoke execute on function public.set_updated_at() from anon, authenticated;
revoke execute on function public.forbid_update() from anon, authenticated;
revoke execute on function public.forbid_owner_change() from anon, authenticated;

-- ===== migrations/20261016000004_training_status.sql =====
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

-- ===== migrations/20261016000005_hyrox_events.sql =====
-- Upcoming HYROX races (product owner request 2026-10-16): athletes pick their race at sign-up.
-- Maintained by us by hand from public announcements. HYROX's terms forbid automatically copying
-- their site (docs/INTEGRATIONS.md), so nothing here is scraped. Every row records its source and
-- stays unverified until checked against HYROX's own announcement.

create table public.hyrox_events (
  id          text primary key check (id ~ '^[a-z0-9-]+$'),
  name        text not null,
  city        text not null,
  region      text,
  country     text not null,
  venue       text,
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'scheduled' check (status in ('scheduled', 'postponed', 'cancelled')),
  source_url  text not null,
  verified    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index hyrox_events_dates_idx on public.hyrox_events (end_date, start_date);
create trigger hyrox_events_updated before update on public.hyrox_events for each row execute function public.set_updated_at();

-- Reference data: signed-in athletes read it; only the service role (SQL Editor) changes it.
alter table public.hyrox_events enable row level security;
create policy hyrox_events_read on public.hyrox_events for select to authenticated using (true);
revoke all on public.hyrox_events from anon, authenticated;
grant select on public.hyrox_events to authenticated;

-- The athlete's chosen race. Nullable: "my race isn't listed" keeps just the date.
alter table public.goals
  add column if not exists hyrox_event_id text references public.hyrox_events (id) on delete set null;

-- Seed: events from https://hybridfitnessmedia.com/2026/03/1… (2026-03-13) and the North America 2027 schedule (2026-07-14),
-- both "subject to change" until HYROX announces them. Shanghai 2026 was reported postponed and is left out.
insert into public.hyrox_events (id, name, city, region, country, venue, start_date, end_date, source_url) values
  ('valencia-2026-10', 'HYROX Valencia', 'Valencia', null, 'Spain', null, '2026-10-16', '2026-10-18', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('sao-paulo-2026-10', 'HYROX São Paulo', 'São Paulo', null, 'Brazil', null, '2026-10-17', '2026-10-17', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('tampa-2026-10', 'HYROX Tampa', 'Tampa', 'FL', 'USA', null, '2026-10-23', '2026-10-25', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('birmingham-2026-10', 'HYROX Birmingham', 'Birmingham', null, 'UK', null, '2026-10-27', '2026-11-01', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('nice-2026-10', 'HYROX Nice', 'Nice', null, 'France', null, '2026-10-29', '2026-11-01', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('dusseldorf-2026-11', 'HYROX Düsseldorf', 'Düsseldorf', null, 'Germany', null, '2026-11-11', '2026-11-15', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('denver-2026-11', 'HYROX Denver', 'Denver', 'CO', 'USA', null, '2026-11-12', '2026-11-15', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('barcelona-2026-11', 'HYROX Barcelona', 'Barcelona', null, 'Spain', null, '2026-11-12', '2026-11-15', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('seoul-2026-11', 'HYROX Seoul', 'Seoul', null, 'South Korea', null, '2026-11-14', '2026-11-15', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('dallas-2026-11', 'HYROX Dallas', 'Dallas', 'TX', 'USA', null, '2026-11-18', '2026-11-22', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('poznan-2026-11', 'HYROX Poznań', 'Poznań', null, 'Poland', null, '2026-11-20', '2026-11-22', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('guangzhou-2026-11', 'HYROX Guangzhou', 'Guangzhou', null, 'China', null, '2026-11-21', '2026-11-22', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('utrecht-2026-11', 'HYROX Utrecht', 'Utrecht', null, 'Netherlands', null, '2026-11-26', '2026-11-29', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('johannesburg-2026-11', 'HYROX Johannesburg', 'Johannesburg', null, 'South Africa', null, '2026-11-27', '2026-11-29', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('london-excel-2026-12', 'HYROX London (ExCeL)', 'London', null, 'UK', null, '2026-12-02', '2026-12-06', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('anaheim-2026-12', 'HYROX Anaheim', 'Anaheim', 'CA', 'USA', null, '2026-12-04', '2026-12-06', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('milan-2026-12', 'HYROX Milan', 'Milan', null, 'Italy', null, '2026-12-05', '2026-12-06', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('frankfurt-2026-12', 'HYROX Frankfurt', 'Frankfurt', null, 'Germany', null, '2026-12-10', '2026-12-13', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('nashville-2026-12', 'HYROX Nashville', 'Nashville', 'TN', 'USA', null, '2026-12-10', '2026-12-13', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('paris-2026-12', 'HYROX Paris', 'Paris', null, 'France', null, '2026-12-12', '2026-12-20', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('ghent-2026-12', 'HYROX Ghent', 'Ghent', null, 'Belgium', null, '2026-12-17', '2026-12-20', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('helsinki-2026-12', 'HYROX Helsinki', 'Helsinki', null, 'Finland', null, '2026-12-18', '2026-12-20', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('vancouver-2026-12', 'HYROX Vancouver', 'Vancouver', 'BC', 'Canada', null, '2026-12-18', '2026-12-20', 'https://hybridfitnessmedia.com/2026/03/13/hyrox-2026-race-calendar/'),
  ('chicago-2027-02', 'HYROX Chicago', 'Chicago', 'IL', 'USA', 'Navy Pier', '2027-02-11', '2027-02-15', 'https://hybridfitnessmedia.com/2026/07/14/hyrox-north-america-2027-schedule-so-far/'),
  ('cancun-2027-02', 'HYROX Cancun', 'Cancún', null, 'Mexico', 'Malecón Tajamar', '2027-02-19', '2027-02-21', 'https://hybridfitnessmedia.com/2026/07/14/hyrox-north-america-2027-schedule-so-far/'),
  ('phoenix-2027-02', 'HYROX Phoenix', 'Phoenix', 'AZ', 'USA', 'State Farm Stadium', '2027-02-25', '2027-02-28', 'https://hybridfitnessmedia.com/2026/07/14/hyrox-north-america-2027-schedule-so-far/'),
  ('las-vegas-2027-03', 'HYROX Las Vegas', 'Las Vegas', 'NV', 'USA', 'Las Vegas Convention Center', '2027-03-12', '2027-03-14', 'https://hybridfitnessmedia.com/2026/07/14/hyrox-north-america-2027-schedule-so-far/'),
  ('guadalajara-2027-03', 'HYROX Guadalajara', 'Guadalajara', null, 'Mexico', 'Expo Guadalajara', '2027-03-19', '2027-03-21', 'https://hybridfitnessmedia.com/2026/07/14/hyrox-north-america-2027-schedule-so-far/'),
  ('miami-beach-2027-03', 'HYROX Miami Beach', 'Miami Beach', 'FL', 'USA', 'Miami Beach Convention Center', '2027-03-26', '2027-03-28', 'https://hybridfitnessmedia.com/2026/07/14/hyrox-north-america-2027-schedule-so-far/'),
  ('houston-2027-04', 'HYROX Houston', 'Houston', 'TX', 'USA', 'NRG Center', '2027-04-01', '2027-04-04', 'https://hybridfitnessmedia.com/2026/07/14/hyrox-north-america-2027-schedule-so-far/'),
  ('monterrey-2027-04', 'HYROX Monterrey', 'Monterrey', null, 'Mexico', 'CINTERMEX', '2027-04-16', '2027-04-18', 'https://hybridfitnessmedia.com/2026/07/14/hyrox-north-america-2027-schedule-so-far/'),
  ('ottawa-2027-04', 'HYROX Ottawa', 'Ottawa', 'ON', 'Canada', 'EY Centre', '2027-04-21', '2027-04-25', 'https://hybridfitnessmedia.com/2026/07/14/hyrox-north-america-2027-schedule-so-far/'),
  ('atlanta-2027-04', 'HYROX Atlanta', 'Atlanta', 'GA', 'USA', 'Georgia World Congress Center', '2027-04-23', '2027-04-25', 'https://hybridfitnessmedia.com/2026/07/14/hyrox-north-america-2027-schedule-so-far/'),
  ('san-diego-2027-05', 'HYROX San Diego', 'San Diego', 'CA', 'USA', 'San Diego Convention Center', '2027-05-13', '2027-05-16', 'https://hybridfitnessmedia.com/2026/07/14/hyrox-north-america-2027-schedule-so-far/'),
  ('portland-2027-05', 'HYROX Portland', 'Portland', 'OR', 'USA', 'Oregon Convention Center', '2027-05-21', '2027-05-23', 'https://hybridfitnessmedia.com/2026/07/14/hyrox-north-america-2027-schedule-so-far/'),
  ('new-york-2027-05', 'HYROX New York', 'New York', 'NY', 'USA', 'Pier 76', '2027-05-27', '2027-06-07', 'https://hybridfitnessmedia.com/2026/07/14/hyrox-north-america-2027-schedule-so-far/'),
  ('puebla-2027-05', 'HYROX Puebla', 'Puebla', null, 'Mexico', 'Exhibitor Center Puebla', '2027-05-28', '2027-05-30', 'https://hybridfitnessmedia.com/2026/07/14/hyrox-north-america-2027-schedule-so-far/')
on conflict (id) do nothing;

-- save_hyrox_onboarding, now also saving the chosen event and HYROX result splits.
-- Otherwise identical to 20261016000004.
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
    insert into goals (athlete_id, kind, event_date, hyrox_division, target_finish_seconds, hyrox_event_id)
    values (aid, 'hyrox', (p ->> 'raceDate')::date, p ->> 'division', (p ->> 'targetFinishSeconds')::integer, p ->> 'eventId')
    returning id into gid;
  else
    update goals set event_date = (p ->> 'raceDate')::date, hyrox_division = p ->> 'division',
                     target_finish_seconds = (p ->> 'targetFinishSeconds')::integer,
                     hyrox_event_id = p ->> 'eventId'
    where id = gid;
  end if;

  -- Results: insert unless an identical one is already stored (re-saving is harmless).
  for b in select * from jsonb_array_elements(coalesce(p -> 'results', '[]')) loop
    insert into race_results (athlete_id, kind, event_date, distance_meters, finish_seconds, timing, hyrox_division, splits)
    select aid, b ->> 'kind', (b ->> 'date')::date, (b ->> 'distanceMeters')::numeric, (b ->> 'finishSeconds')::integer,
           b ->> 'timing', b ->> 'division', b -> 'splits'
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

-- ===== migrations/20261016000006_plan_storage.sql =====
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

-- ===== migrations/20261016000007_workout_logging.sql =====
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

-- ===== migrations/20261016000008_adaptation_runs.sql =====
-- Adaptation on the server (D-026): after each log, the adapt-plan Edge Function runs the engine
-- and saves the result here through record_adaptation (service role only).

-- Answers to the engine's questions (AthleteAnswer). Athlete input: they write their own, never
-- edit (a new answer supersedes an older one; the engine reads the latest).
create table public.athlete_answers (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.athletes (id) on delete cascade,
  question_id text not null check (char_length(question_id) between 1 and 100),
  value       text not null check (char_length(value) between 1 and 200),
  answered_on date not null,
  created_at  timestamptz not null default now()
);
create index athlete_answers_idx on public.athlete_answers (athlete_id, question_id, answered_on desc);

-- One row per adaptation run: the weekly review the athlete sees (what was checked, what changed,
-- why nothing else did, what's waiting on data, and the questions). Engine output: server-written.
create table public.plan_reviews (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null,
  athlete_id   uuid not null,
  from_version integer not null,
  to_version   integer,            -- set when this run created a new plan version
  review       jsonb not null,
  created_at   timestamptz not null default now(),
  foreign key (plan_id, athlete_id) references public.training_plans (id, athlete_id) on delete cascade
);
create index plan_reviews_idx on public.plan_reviews (athlete_id, created_at desc);

create trigger athlete_answers_append_only before update on public.athlete_answers for each row execute function public.forbid_update();
create trigger plan_reviews_append_only before update on public.plan_reviews for each row execute function public.forbid_update();

alter table public.athlete_answers enable row level security;
alter table public.plan_reviews enable row level security;
grant select, insert on public.athlete_answers to authenticated;
create policy athlete_answers_read on public.athlete_answers for select to authenticated using (public.owns_athlete(athlete_id));
create policy athlete_answers_add on public.athlete_answers for insert to authenticated with check (public.owns_athlete(athlete_id));
grant select on public.plan_reviews to authenticated;
create policy plan_reviews_read on public.plan_reviews for select to authenticated using (public.owns_athlete(athlete_id));

-- Saves one adaptation run in a single transaction.
--   * p_from_version must still be the plan's current version; otherwise another run got there
--     first and this one is rejected (the caller re-runs on the newer version).
--   * p_workouts not null: the run changed the plan. A new version ('adapted') replaces every
--     session; inputs are copied from the version it adapted. Its decisions (applied and
--     suppressed) are stored in adaptation_decisions with to_version set.
--   * Every run stores its review.
create or replace function public.record_adaptation(
  p_plan_id        uuid,
  p_athlete_id     uuid,
  p_from_version   integer,
  p_engine_version text,
  p_basis          jsonb,
  p_weeks          jsonb,
  p_workouts       jsonb,
  p_decisions      jsonb,
  p_review         jsonb
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  cur     integer;
  prev    plan_versions%rowtype;
  vid     uuid;
  new_ver integer;
  rid     uuid;
begin
  select current_version into cur from training_plans
  where id = p_plan_id and athlete_id = p_athlete_id and status = 'active'
  for update;
  if cur is null then
    raise exception 'No active plan % for athlete %', p_plan_id, p_athlete_id using errcode = 'foreign_key_violation';
  end if;
  if cur <> p_from_version then
    raise exception 'Plan is at version %, not %', cur, p_from_version using errcode = 'serialization_failure';
  end if;

  if p_workouts is not null then
    select * into prev from plan_versions where plan_id = p_plan_id and version = cur;
    new_ver := cur + 1;
    insert into plan_versions (plan_id, athlete_id, version, engine_version, basis, reason, starts_on, weeks, inputs)
    values (p_plan_id, p_athlete_id, new_ver, p_engine_version, p_basis, 'adapted',
            coalesce((select min((w ->> 'startDate')::date) from jsonb_array_elements(p_weeks) w), prev.starts_on),
            p_weeks, prev.inputs)
    returning id into vid;

    insert into planned_workouts (plan_version_id, athlete_id, workout_key, scheduled_date, position, sport, session_type,
                                  title, estimated_minutes, planned_meters, planned_load, adapted_by_rule, body)
    select vid, p_athlete_id, w ->> 'workout_key', (w ->> 'scheduled_date')::date, (w ->> 'position')::integer,
           w ->> 'sport', w ->> 'session_type', w ->> 'title', (w ->> 'estimated_minutes')::smallint,
           (w ->> 'planned_meters')::integer, (w ->> 'planned_load')::integer, w ->> 'adapted_by_rule', w -> 'body'
    from jsonb_array_elements(p_workouts) w;

    insert into adaptation_decisions (plan_id, athlete_id, from_version, to_version, rule_id, rule_version, action, outcome,
                                      suppressed_reason, confidence, what_changed, why, next_steps, question, evidence, changes)
    select p_plan_id, p_athlete_id, cur, new_ver, d ->> 'rule_id', (d ->> 'rule_version')::integer, d ->> 'action', d ->> 'outcome',
           d ->> 'suppressed_reason', (d ->> 'confidence')::numeric, d ->> 'what_changed', d ->> 'why', d ->> 'next_steps',
           d ->> 'question', d -> 'evidence', d -> 'changes'
    from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) d;

    update training_plans set current_version = new_ver where id = p_plan_id;
  end if;

  insert into plan_reviews (plan_id, athlete_id, from_version, to_version, review)
  values (p_plan_id, p_athlete_id, cur, new_ver, p_review)
  returning id into rid;

  return jsonb_build_object('version', coalesce(new_ver, cur), 'changed', new_ver is not null, 'review_id', rid);
end $$;

revoke all on function public.record_adaptation(uuid, uuid, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
revoke execute on function public.record_adaptation(uuid, uuid, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb) from anon, authenticated;
grant execute on function public.record_adaptation(uuid, uuid, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;

-- Data export includes the new athlete data (same as 20261015000001_init.sql plus two tables).
-- create or replace keeps the existing grants (no anon access, 20261015000003).
create or replace function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'exported_at', now(),
    'athlete', (select to_jsonb(a) from athletes a),
    'hyrox_profile', (select to_jsonb(p) from hyrox_profiles p),
    'equipment', coalesce((select jsonb_agg(e.equipment) from athlete_equipment e), '[]'),
    'limitations', coalesce((select jsonb_agg(to_jsonb(l)) from athlete_limitations l), '[]'),
    'goals', coalesce((select jsonb_agg(to_jsonb(g)) from goals g), '[]'),
    'race_results', coalesce((select jsonb_agg(to_jsonb(r)) from race_results r), '[]'),
    'completed_workouts', coalesce((select jsonb_agg(to_jsonb(c)) from completed_workouts c), '[]'),
    'daily_recovery', coalesce((select jsonb_agg(to_jsonb(d)) from daily_recovery d), '[]'),
    'training_plans', coalesce((select jsonb_agg(to_jsonb(t)) from training_plans t), '[]'),
    'plan_versions', coalesce((select jsonb_agg(to_jsonb(v)) from plan_versions v), '[]'),
    'planned_workouts', coalesce((select jsonb_agg(to_jsonb(w)) from planned_workouts w), '[]'),
    'adaptation_decisions', coalesce((select jsonb_agg(to_jsonb(x)) from adaptation_decisions x), '[]'),
    'plan_reviews', coalesce((select jsonb_agg(to_jsonb(pr)) from plan_reviews pr), '[]'),
    'athlete_answers', coalesce((select jsonb_agg(to_jsonb(aa)) from athlete_answers aa), '[]'),
    'consents', coalesce((select jsonb_agg(to_jsonb(k)) from consents k), '[]'),
    'provider_connections', coalesce((select jsonb_agg(to_jsonb(pc) - 'sync_cursor') from provider_connections pc), '[]')
  );
$$;

-- ===== migrations/20261016000009_leaderboard.sql =====
-- Leaderboard (D-029): opt-in, nickname only, ranking consistency (plan completion, days trained,
-- sessions logged) worldwide or within a gym. Nothing about individual workouts, paces, pain or
-- health is ever exposed to other athletes: they only see the aggregates the leaderboard()
-- function returns, and only for athletes who opted in.

create table public.gyms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 2 and 60),
  join_code  text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  created_by uuid references public.athletes (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.leaderboard_profiles (
  athlete_id uuid primary key references public.athletes (id) on delete cascade,
  nickname   text not null check (char_length(nickname) between 2 and 24 and nickname ~ '^[A-Za-z0-9][A-Za-z0-9 _.-]*$'),
  opted_in   boolean not null default true,
  gym_id     uuid references public.gyms (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index leaderboard_nickname_unique on public.leaderboard_profiles (lower(nickname));
create index leaderboard_gym_idx on public.leaderboard_profiles (gym_id) where opted_in;
create trigger leaderboard_profiles_updated before update on public.leaderboard_profiles for each row execute function public.set_updated_at();

alter table public.gyms enable row level security;
alter table public.leaderboard_profiles enable row level security;

-- Your own leaderboard profile: read, create, rename, opt in or out, delete.
create policy leaderboard_own_select on public.leaderboard_profiles for select to authenticated using (public.owns_athlete(athlete_id));
create policy leaderboard_own_insert on public.leaderboard_profiles for insert to authenticated with check (public.owns_athlete(athlete_id) and gym_id is null);
create policy leaderboard_own_update on public.leaderboard_profiles for update to authenticated using (public.owns_athlete(athlete_id)) with check (public.owns_athlete(athlete_id));
create policy leaderboard_own_delete on public.leaderboard_profiles for delete to authenticated using (public.owns_athlete(athlete_id));
-- gym_id changes only through join_gym / leave_gym (which check the join code), never directly.
revoke all on public.leaderboard_profiles from anon, authenticated;
grant select, delete on public.leaderboard_profiles to authenticated;
grant insert (athlete_id, nickname, opted_in) on public.leaderboard_profiles to authenticated;
grant update (nickname, opted_in) on public.leaderboard_profiles to authenticated;

-- A gym is visible only to its members (name and join code, so they can invite others).
create policy gyms_member_select on public.gyms for select to authenticated using (
  exists (select 1 from public.leaderboard_profiles lp where lp.gym_id = gyms.id and public.owns_athlete(lp.athlete_id))
);
revoke all on public.gyms from anon, authenticated;
grant select on public.gyms to authenticated;

-- The signed-in user's athlete id (null when not signed in or not onboarded).
create or replace function public.my_athlete_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.athletes where user_id = auth.uid();
$$;

-- Create a gym and join it. Returns its join code to share. At most 3 gyms per athlete.
create or replace function public.create_gym(p_name text) returns table (id uuid, name text, join_code text)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me uuid := public.my_athlete_id();
  code text;
  gid uuid;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O or 1/I
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.leaderboard_profiles where athlete_id = me) then
    raise exception 'Join the leaderboard first.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.gyms g where g.created_by = me) >= 3 then
    raise exception 'You can create up to 3 gyms.' using errcode = 'P0001';
  end if;
  loop
    code := (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.gyms g where g.join_code = code);
  end loop;
  insert into public.gyms (name, join_code, created_by) values (btrim(p_name), code, me) returning gyms.id into gid;
  update public.leaderboard_profiles set gym_id = gid where athlete_id = me;
  return query select g.id, g.name, g.join_code from public.gyms g where g.id = gid;
end $$;

-- Join a gym by its code (case-insensitive). Replaces any previous gym.
create or replace function public.join_gym(p_code text) returns table (id uuid, name text, join_code text)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me uuid := public.my_athlete_id();
  gid uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.leaderboard_profiles where athlete_id = me) then
    raise exception 'Join the leaderboard first.' using errcode = 'P0001';
  end if;
  select g.id into gid from public.gyms g where g.join_code = upper(btrim(p_code));
  if gid is null then raise exception 'No gym has that code. Check it with your coach.' using errcode = 'P0001'; end if;
  update public.leaderboard_profiles set gym_id = gid where athlete_id = me;
  return query select g.id, g.name, g.join_code from public.gyms g where g.id = gid;
end $$;

create or replace function public.leave_gym() returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update public.leaderboard_profiles set gym_id = null where athlete_id = public.my_athlete_id();
$$;

-- The leaderboard: opted-in athletes only, nickname and consistency figures only.
--   completion_pct: share of the sessions in their current plan for the window that they logged
--                   as done (partial counts half). Null when nothing was planned yet.
--   days_trained:   distinct days with any logged training (planned or not).
--   sessions_logged: logs that weren't marked skipped.
-- p_scope 'gym' (the caller's gym) or 'world'; p_days 7 or 28, ending on p_today (the caller's
-- local date, accepted within a day of the server's). The caller must have opted in to look.
create or replace function public.leaderboard(p_scope text, p_days integer, p_today date)
returns table (rank integer, nickname text, completion_pct integer, days_trained integer, sessions_logged integer, is_me boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  me uuid := public.my_athlete_id();
  my_gym uuid;
  d_from date;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_scope not in ('gym', 'world') or p_days not in (7, 28) then raise exception 'bad request' using errcode = '22023'; end if;
  if abs(p_today - current_date) > 1 then raise exception 'bad date' using errcode = '22023'; end if;
  if not exists (select 1 from public.leaderboard_profiles where athlete_id = me and opted_in) then
    raise exception 'Join the leaderboard to see it.' using errcode = 'P0001';
  end if;
  select lp.gym_id into my_gym from public.leaderboard_profiles lp where lp.athlete_id = me;
  if p_scope = 'gym' and my_gym is null then raise exception 'Join a gym to see its leaderboard.' using errcode = 'P0001'; end if;
  d_from := p_today - (p_days - 1);

  return query
  with members as (
    select lp.athlete_id, lp.nickname
    from public.leaderboard_profiles lp
    where lp.opted_in and (p_scope = 'world' or lp.gym_id = my_gym)
  ),
  planned as (
    select m.athlete_id, tp.id as plan_id, pw.workout_key
    from members m
    join public.training_plans tp on tp.athlete_id = m.athlete_id and tp.status = 'active'
    join public.plan_versions pv on pv.plan_id = tp.id and pv.version = tp.current_version
    join public.planned_workouts pw on pw.plan_version_id = pv.id
    where pw.scheduled_date between d_from and p_today and pw.session_type not in ('rest', 'race')
  ),
  done as (
    select p.athlete_id, count(*) as planned_n,
           sum(case c.status when 'completed' then 1.0 when 'partial' then 0.5 else 0 end) as done_n
    from planned p
    left join public.completed_workouts c on c.athlete_id = p.athlete_id and c.plan_id = p.plan_id and c.workout_key = p.workout_key
    group by p.athlete_id
  ),
  logged as (
    select c.athlete_id, count(distinct c.workout_date) as days_n, count(*) as logs_n
    from public.completed_workouts c
    join members m on m.athlete_id = c.athlete_id
    where c.workout_date between d_from and p_today and c.status <> 'skipped'
    group by c.athlete_id
  ),
  scored as (
    select m.nickname, m.athlete_id,
           case when coalesce(d.planned_n, 0) > 0 then least(100, round(100 * d.done_n / d.planned_n))::int end as pct,
           coalesce(l.days_n, 0)::int as days_n,
           coalesce(l.logs_n, 0)::int as logs_n
    from members m
    left join done d on d.athlete_id = m.athlete_id
    left join logged l on l.athlete_id = m.athlete_id
  ),
  ranked as (
    select s.*, (rank() over (order by s.pct desc nulls last, s.days_n desc, s.logs_n desc))::int as r
    from scored s
  )
  select r.r, r.nickname, r.pct, r.days_n, r.logs_n, r.athlete_id = me
  from ranked r
  where r.r <= 100 or r.athlete_id = me
  order by r.r, lower(r.nickname);
end $$;

revoke all on function public.my_athlete_id() from public, anon;
revoke all on function public.create_gym(text) from public, anon;
revoke all on function public.join_gym(text) from public, anon;
revoke all on function public.leave_gym() from public, anon;
revoke all on function public.leaderboard(text, integer, date) from public, anon;
grant execute on function public.my_athlete_id() to authenticated, service_role;
grant execute on function public.create_gym(text) to authenticated;
grant execute on function public.join_gym(text) to authenticated;
grant execute on function public.leave_gym() to authenticated;
grant execute on function public.leaderboard(text, integer, date) to authenticated;

-- The data export includes the leaderboard profile and gym.
create or replace function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'exported_at', now(),
    'athlete', (select to_jsonb(a) from athletes a),
    'hyrox_profile', (select to_jsonb(p) from hyrox_profiles p),
    'equipment', coalesce((select jsonb_agg(e.equipment) from athlete_equipment e), '[]'),
    'limitations', coalesce((select jsonb_agg(to_jsonb(l)) from athlete_limitations l), '[]'),
    'goals', coalesce((select jsonb_agg(to_jsonb(g)) from goals g), '[]'),
    'race_results', coalesce((select jsonb_agg(to_jsonb(r)) from race_results r), '[]'),
    'completed_workouts', coalesce((select jsonb_agg(to_jsonb(c)) from completed_workouts c), '[]'),
    'daily_recovery', coalesce((select jsonb_agg(to_jsonb(d)) from daily_recovery d), '[]'),
    'training_plans', coalesce((select jsonb_agg(to_jsonb(t)) from training_plans t), '[]'),
    'plan_versions', coalesce((select jsonb_agg(to_jsonb(v)) from plan_versions v), '[]'),
    'planned_workouts', coalesce((select jsonb_agg(to_jsonb(w)) from planned_workouts w), '[]'),
    'adaptation_decisions', coalesce((select jsonb_agg(to_jsonb(x)) from adaptation_decisions x), '[]'),
    'plan_reviews', coalesce((select jsonb_agg(to_jsonb(pr)) from plan_reviews pr), '[]'),
    'athlete_answers', coalesce((select jsonb_agg(to_jsonb(aa)) from athlete_answers aa), '[]'),
    'consents', coalesce((select jsonb_agg(to_jsonb(k)) from consents k), '[]'),
    'provider_connections', coalesce((select jsonb_agg(to_jsonb(pc) - 'sync_cursor') from provider_connections pc), '[]'),
    'leaderboard_profile', (select to_jsonb(lp) from leaderboard_profiles lp),
    'gym', (select jsonb_build_object('name', g.name) from gyms g)
  );
$$;

-- ===== migrations/20261017000010_account_deletion.sql =====
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

-- ===== migrations/20261017000011_plan_start_date.sql =====
-- Plan start day (product owner 2026-10-16): onboarding asks when to start (today, tomorrow or next
-- Monday). The engine starts the plan that day; once the day has passed, a plan rebuilt after editing
-- answers starts next Monday so the current week carries over (D-022). Null means next Monday, as before.
alter table public.hyrox_profiles add column if not exists plan_start_date date;

-- save_hyrox_onboarding, now also saving plan_start_date. Otherwise identical to 20261016000005.
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
  -- The app offers today, tomorrow or next Monday; anything far off is a mistake.
  if (p ->> 'planStartDate')::date > current_date + 31 then
    raise exception 'Pick a start day within the next month' using errcode = 'check_violation';
  end if;

  insert into athletes (user_id, units) values (uid, coalesce(p ->> 'units', 'mi'))
  on conflict (user_id) do update set units = excluded.units
  returning id into aid;

  insert into hyrox_profiles (athlete_id, level, wants_doubles, gym_types, available_days, long_session_day,
                              max_weekday_minutes, max_weekend_minutes, weekly_run_meters, training_status, plan_start_date)
  values (aid,
          p ->> 'level',
          (p ->> 'wantsDoubles')::boolean,
          coalesce(array(select jsonb_array_elements_text(p -> 'gymTypes')), '{}'),
          array(select (jsonb_array_elements_text(p -> 'availableDays'))::smallint),
          (p ->> 'longDay')::smallint,
          (p ->> 'weekdayMinutes')::smallint,
          (p ->> 'weekendMinutes')::smallint,
          (p ->> 'weeklyRunMeters')::integer,
          p ->> 'trainingStatus',
          (p ->> 'planStartDate')::date)
  on conflict (athlete_id) do update set
    level = excluded.level, wants_doubles = excluded.wants_doubles, gym_types = excluded.gym_types,
    available_days = excluded.available_days, long_session_day = excluded.long_session_day,
    max_weekday_minutes = excluded.max_weekday_minutes, max_weekend_minutes = excluded.max_weekend_minutes,
    weekly_run_meters = excluded.weekly_run_meters, training_status = excluded.training_status,
    plan_start_date = excluded.plan_start_date;

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
    insert into goals (athlete_id, kind, event_date, hyrox_division, target_finish_seconds, hyrox_event_id)
    values (aid, 'hyrox', (p ->> 'raceDate')::date, p ->> 'division', (p ->> 'targetFinishSeconds')::integer, p ->> 'eventId')
    returning id into gid;
  else
    update goals set event_date = (p ->> 'raceDate')::date, hyrox_division = p ->> 'division',
                     target_finish_seconds = (p ->> 'targetFinishSeconds')::integer,
                     hyrox_event_id = p ->> 'eventId'
    where id = gid;
  end if;

  -- Results: insert unless an identical one is already stored (re-saving is harmless).
  for b in select * from jsonb_array_elements(coalesce(p -> 'results', '[]')) loop
    insert into race_results (athlete_id, kind, event_date, distance_meters, finish_seconds, timing, hyrox_division, splits)
    select aid, b ->> 'kind', (b ->> 'date')::date, (b ->> 'distanceMeters')::numeric, (b ->> 'finishSeconds')::integer,
           b ->> 'timing', b ->> 'division', b -> 'splits'
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

commit;

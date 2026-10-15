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

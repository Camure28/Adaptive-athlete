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

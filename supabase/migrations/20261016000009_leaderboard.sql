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

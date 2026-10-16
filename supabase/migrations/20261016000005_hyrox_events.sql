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

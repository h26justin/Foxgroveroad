-- =============================================================================
-- FOXGROVE ROAD — HEATING (Heatmiser neoHub) (v47)
-- =============================================================================
-- The neoHub only speaks a LAN API (wss://<hub>:4243), so Vercel can't
-- reach it. A small relay at the house (heating-relay/) polls the hub
-- and POSTs to /api/heating/sync, which writes these tables with the
-- service-role client and hands back any queued commands.
--
--   heating_hub_status  singleton — when the relay last reported in
--   heating_zones       latest snapshot per thermostat zone
--   heating_readings    5-minute time series (indoor + outdoor temp)
--   heating_daily       per-zone daily roll-up, kept indefinitely
--   heating_commands    admin-queued changes, picked up by the relay
--
-- heating_zone_models() fits a simple thermal model per room from the
-- readings (how fast it loses heat vs the outdoor temperature, and how
-- fast the heating warms it), which the app uses to predict heating
-- hours and warm-up times. Outdoor temperature comes from Open-Meteo.
--
-- Run once in Supabase SQL Editor. Safe to re-run.
-- =============================================================================

-- ─── 1. HUB STATUS (singleton) ─────────────────────────────────────────────

create table if not exists heating_hub_status (
  id            text        primary key default 'singleton',
  last_seen_at  timestamptz,
  hub_away      boolean     not null default false,
  hub_holiday   boolean     not null default false,
  error         text,                       -- last relay-side error, null when healthy
  outdoor_temp        numeric(4,1),         -- latest from Open-Meteo
  outdoor_fetched_at  timestamptz,
  forecast            jsonb,                -- [{date, min, max}] today + tomorrow
  rollup_at           timestamptz,          -- last heating_rollup() run
  updated_at    timestamptz not null default now()
);

insert into heating_hub_status (id) values ('singleton')
on conflict (id) do nothing;

-- ─── 2. ZONES (latest snapshot) ────────────────────────────────────────────

create table if not exists heating_zones (
  zone_name    text        primary key check (length(zone_name) > 0 and length(zone_name) <= 100),
  actual_temp  numeric(4,1),
  set_temp     numeric(4,1),
  heat_on      boolean     not null default false,
  hold_on      boolean     not null default false,
  hold_temp    numeric(4,1),
  hold_time    text,                        -- "H:MM" remaining, as the hub reports it
  frost_on     boolean     not null default false,  -- STANDBY on the hub
  window_open  boolean     not null default false,
  low_battery  boolean     not null default false,
  offline      boolean     not null default false,
  updated_at   timestamptz not null default now()
);

-- ─── 3. READINGS (time series) ─────────────────────────────────────────────

create table if not exists heating_readings (
  id           bigint      generated always as identity primary key,
  zone_name    text        not null,
  recorded_at  timestamptz not null default now(),
  actual_temp  numeric(4,1),
  set_temp     numeric(4,1),
  heat_on      boolean     not null default false,
  outdoor_temp numeric(4,1)
);

create index if not exists heating_readings_zone_time_idx
  on heating_readings(zone_name, recorded_at desc);
create index if not exists heating_readings_time_idx
  on heating_readings(recorded_at desc);

-- ─── 3b. DAILY ROLL-UP ─────────────────────────────────────────────────────
-- Raw readings are pruned after 180 days; this keeps one row per room per
-- day forever so year-on-year comparisons still work.

create table if not exists heating_daily (
  zone_name      text        not null,
  day            date        not null,      -- Europe/London calendar day
  avg_temp       numeric(4,1),
  min_temp       numeric(4,1),
  max_temp       numeric(4,1),
  avg_set_temp   numeric(4,1),
  avg_outdoor    numeric(4,1),
  heating_hours  numeric(5,2) not null default 0,
  readings       int         not null default 0,
  primary key (zone_name, day)
);

-- ─── 4. COMMANDS (admin → relay queue) ─────────────────────────────────────

create table if not exists heating_commands (
  id            uuid        primary key default gen_random_uuid(),
  kind          text        not null check (kind in (
                              'set_temp', 'hold', 'cancel_hold',
                              'frost_on', 'frost_off', 'away_on', 'away_off'
                            )),
  zone_name     text,                       -- null for hub-wide (away_*)
  temp          numeric(4,1) check (temp is null or (temp >= 5 and temp <= 30)),
  minutes       int          check (minutes is null or (minutes > 0 and minutes <= 24 * 60)),
  status        text        not null default 'pending' check (status in (
                              'pending', 'sent', 'done', 'failed'
                            )),
  result        text,
  requested_by  uuid                references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  completed_at  timestamptz
);

create index if not exists heating_commands_pending_idx
  on heating_commands(created_at) where status in ('pending', 'sent');
create index if not exists heating_commands_recent_idx
  on heating_commands(created_at desc);

-- ─── 5. RLS ────────────────────────────────────────────────────────────────
-- Admin-only. The relay never uses a user session — /api/heating/sync
-- authenticates with HEATING_RELAY_SECRET and writes via service role.

alter table heating_hub_status enable row level security;
alter table heating_zones      enable row level security;
alter table heating_readings   enable row level security;
alter table heating_commands   enable row level security;
alter table heating_daily      enable row level security;

drop policy if exists "heating_daily_admin_read" on heating_daily;
create policy "heating_daily_admin_read"
  on heating_daily for select to authenticated using (is_admin());

drop policy if exists "heating_hub_admin_read" on heating_hub_status;
create policy "heating_hub_admin_read"
  on heating_hub_status for select to authenticated using (is_admin());

drop policy if exists "heating_zones_admin_read" on heating_zones;
create policy "heating_zones_admin_read"
  on heating_zones for select to authenticated using (is_admin());

drop policy if exists "heating_readings_admin_read" on heating_readings;
create policy "heating_readings_admin_read"
  on heating_readings for select to authenticated using (is_admin());

drop policy if exists "heating_commands_admin_read" on heating_commands;
create policy "heating_commands_admin_read"
  on heating_commands for select to authenticated using (is_admin());

drop policy if exists "heating_commands_admin_insert" on heating_commands;
create policy "heating_commands_admin_insert"
  on heating_commands for insert to authenticated
  with check (is_admin() and status = 'pending' and requested_by = auth.uid());

-- ─── 6. SETTINGS ───────────────────────────────────────────────────────────
-- Alert threshold for "room is cold" pushes to admins, and the house's
-- location for outdoor temperature (defaults to Bromley). Edit in House info.

insert into house_settings (key, value) values
  ('heating_cold_alert_c', '12'),
  ('weather_latitude',  '51.406'),
  ('weather_longitude', '0.015')
on conflict (key) do nothing;

-- ─── 7. DAILY ROLL-UP FUNCTION ─────────────────────────────────────────────
-- Recomputes heating_daily for every day from p_since (London dates).
-- Heating hours weight each reading by the gap to the next one (capped
-- at 15 min, so a relay outage doesn't count as hours of heating).
-- Called by /api/heating/sync roughly hourly via the service role.

create or replace function public.heating_rollup(p_since date)
returns void
language sql
security invoker
set search_path to 'public'
as $$
  with r as (
    select zone_name,
           (recorded_at at time zone 'Europe/London')::date as day,
           actual_temp, set_temp, outdoor_temp, heat_on,
           least(
             extract(epoch from coalesce(
               lead(recorded_at) over (partition by zone_name order by recorded_at) - recorded_at,
               interval '5 minutes')) / 3600.0,
             0.25) as span_h
      from heating_readings
     where recorded_at >= (p_since::timestamp at time zone 'Europe/London')
  )
  insert into heating_daily as d (
    zone_name, day, avg_temp, min_temp, max_temp, avg_set_temp,
    avg_outdoor, heating_hours, readings
  )
  select zone_name, day,
         round(avg(actual_temp), 1), min(actual_temp), max(actual_temp),
         round(avg(set_temp), 1), round(avg(outdoor_temp), 1),
         round(sum(case when heat_on then span_h else 0 end)::numeric, 2),
         count(*)
    from r
   group by zone_name, day
  on conflict (zone_name, day) do update set
    avg_temp = excluded.avg_temp, min_temp = excluded.min_temp,
    max_temp = excluded.max_temp, avg_set_temp = excluded.avg_set_temp,
    avg_outdoor = excluded.avg_outdoor, heating_hours = excluded.heating_hours,
    readings = excluded.readings;
$$;

revoke all on function public.heating_rollup(date) from anon, authenticated, public;
grant execute on function public.heating_rollup(date) to service_role;

-- ─── 8. THERMAL MODEL ──────────────────────────────────────────────────────
-- Per room, fits (ordinary least squares over the last p_days):
--
--     dT/dt = -k·(T - T_out) + h·heating + c        (°C per hour)
--
--   k  heat loss: how fast the room cools per °C it's warmer than outside
--   h  heating power: extra °C/hour while the thermostat is calling for heat
--   c  background gains (sun, people, other rooms) in °C/hour
--
-- Uses 15-minute steps (3 readings apart) to smooth the hub's 0.1°C
-- resolution; `heating` is the fraction of that step the heat was on.
-- Solved in closed form from the regression sums. Rooms with too little
-- data, or no variation in heating, return null coefficients.

create or replace function public.heating_zone_models(p_days int default 28)
returns table (
  zone_name     text,
  samples       bigint,
  heating_share numeric,
  k             numeric,
  h             numeric,
  c             numeric,
  r2            numeric
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with r as (
    select hr.zone_name, hr.recorded_at,
           hr.actual_temp::float8 as t,
           lag(hr.recorded_at, 3)               over w as prev_at,
           lag(hr.actual_temp::float8, 3)       over w as prev_t,
           lag(hr.outdoor_temp::float8, 3)      over w as prev_o,
           avg(hr.heat_on::int::float8) over (
             partition by hr.zone_name order by hr.recorded_at
             rows between 3 preceding and 1 preceding
           ) as frac_on
      from heating_readings hr
     where hr.recorded_at > now() - make_interval(days => p_days)
       and hr.actual_temp is not null
    window w as (partition by hr.zone_name order by hr.recorded_at)
  ),
  s as (
    select zone_name,
           (t - prev_t) / (extract(epoch from recorded_at - prev_at) / 3600.0) as y,
           prev_t - prev_o as x1,
           frac_on as x2
      from r
     where prev_at is not null
       and prev_o is not null
       and recorded_at - prev_at between interval '12 minutes' and interval '20 minutes'
  ),
  agg as (
    select zone_name,
           count(*)                as n,
           avg(x2)                 as share,
           avg(y)  as my, avg(x1) as m1, avg(x2) as m2,
           regr_sxx(y, x1)         as s11,
           regr_sxx(y, x2)         as s22,
           regr_sxy(x1, x2)        as s12,
           regr_sxy(y, x1)         as s1y,
           regr_sxy(y, x2)         as s2y,
           regr_syy(y, x1)         as syy
      from s
     group by zone_name
  ),
  fit as (
    select *,
           s11 * s22 - s12 * s12 as det
      from agg
  ),
  coef as (
    select zone_name, n, share, my, m1, m2, s1y, s2y, syy,
           case when n >= 200 and det > 1e-6 then (s22 * s1y - s12 * s2y) / det end as a,
           case when n >= 200 and det > 1e-6 then (s11 * s2y - s12 * s1y) / det end as hh
      from fit
  )
  select zone_name,
         n,
         round(share::numeric, 3),
         round((-a)::numeric, 4),
         round(hh::numeric, 3),
         round((my - a * m1 - hh * m2)::numeric, 3),
         case when syy > 0 and a is not null
              then round(((a * s1y + hh * s2y) / syy)::numeric, 3) end
    from coef;
$$;

grant execute on function public.heating_zone_models(int) to authenticated;

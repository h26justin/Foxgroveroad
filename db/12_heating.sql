-- =============================================================================
-- FOXGROVE ROAD — HEATING (Heatmiser neoHub)
-- =============================================================================
-- The neoHub only answers on the home network, so a small bridge
-- (bridge/heatmiser/, runs on a Raspberry Pi in the house) polls it and
-- POSTs to /api/heating/bridge. That route writes here with the service
-- role. People only ever read these tables, except admins, who can queue
-- a small, whitelisted set of commands and edit zone settings.
--
--   heating_hub        one row: when the bridge last checked in, away mode
--   heating_zones      one row per neoStat zone, with its latest reading
--   heating_readings   history, one row per zone about every 5 minutes
--   heating_commands   admin → bridge queue (hold / cancel hold / away)
--   heating_alerts     frost, offline, low battery, not heating, …
--   heating_reports    the weekly summary written by a Claude routine
--
-- Run once in Supabase SQL Editor. Safe to re-run.
-- =============================================================================

-- Admins and family can see the heating; cleaners and pending users can't.
create or replace function public.is_household()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
     where id = auth.uid()
       and role in ('admin', 'family')
       and coalesce(is_deleted, false) = false
  );
$$;


-- ─── HUB ───────────────────────────────────────────────────────────────────

create table if not exists heating_hub (
  id              smallint     primary key default 1 check (id = 1),
  last_seen_at    timestamptz,
  away            boolean      not null default false,
  holiday         boolean      not null default false,
  bridge_version  text,
  updated_at      timestamptz  not null default now()
);

insert into heating_hub (id) values (1) on conflict (id) do nothing;

alter table heating_hub enable row level security;

drop policy if exists "heating_hub_read" on heating_hub;
create policy "heating_hub_read"
  on heating_hub for select to authenticated using (is_household());


-- ─── ZONES ─────────────────────────────────────────────────────────────────

create table if not exists heating_zones (
  id               uuid         primary key default gen_random_uuid(),
  -- The neoStat's zone name as set in the Heatmiser app. The bridge
  -- matches on this, so renaming a zone in the app creates a new row.
  name             text         not null unique check (length(name) between 1 and 100),
  room_id          uuid                 references rooms(id) on delete set null,
  is_hidden        boolean      not null default false,
  current_temp     numeric(4,1),
  set_temp         numeric(4,1),
  heat_on          boolean,
  offline          boolean      not null default false,
  low_battery      boolean      not null default false,
  hold_on          boolean      not null default false,
  hold_temp        numeric(4,1),
  standby          boolean      not null default false,
  last_reading_at  timestamptz,
  updated_at       timestamptz  not null default now(),
  created_at       timestamptz  not null default now()
);

alter table heating_zones enable row level security;

drop policy if exists "heating_zones_read" on heating_zones;
create policy "heating_zones_read"
  on heating_zones for select to authenticated using (is_household());

-- Admins may link a zone to a room or hide it. Readings stay
-- service-role only: the column grant below limits what an admin's
-- update can touch.
drop policy if exists "heating_zones_admin_update" on heating_zones;
create policy "heating_zones_admin_update"
  on heating_zones for update to authenticated
  using (is_admin()) with check (is_admin());

revoke update on heating_zones from authenticated;
grant update (room_id, is_hidden) on heating_zones to authenticated;


-- ─── READINGS ──────────────────────────────────────────────────────────────

create table if not exists heating_readings (
  id            bigint       generated always as identity primary key,
  zone_id       uuid         not null references heating_zones(id) on delete cascade,
  recorded_at   timestamptz  not null default now(),
  current_temp  numeric(4,1),
  set_temp      numeric(4,1),
  heat_on       boolean
);

create index if not exists heating_readings_zone_time_idx
  on heating_readings(zone_id, recorded_at desc);
create index if not exists heating_readings_time_idx
  on heating_readings(recorded_at desc);

alter table heating_readings enable row level security;

drop policy if exists "heating_readings_read" on heating_readings;
create policy "heating_readings_read"
  on heating_readings for select to authenticated using (is_household());


-- ─── COMMANDS ──────────────────────────────────────────────────────────────
-- Only these four kinds exist; the bridge refuses anything else too.
-- Limits match lib/heating.ts: 5–25 °C, 15 min – 12 h.

create table if not exists heating_commands (
  id            uuid         primary key default gen_random_uuid(),
  kind          text         not null check (kind in ('hold', 'cancel_hold', 'away_on', 'away_off')),
  zone_id       uuid                 references heating_zones(id) on delete cascade,
  temp          numeric(4,1) check (temp is null or temp between 5 and 25),
  minutes       integer      check (minutes is null or minutes between 15 and 720),
  status        text         not null default 'pending'
                             check (status in ('pending', 'sent', 'done', 'failed', 'expired')),
  error         text,
  requested_by  uuid                 references profiles(id) on delete set null,
  created_at    timestamptz  not null default now(),
  sent_at       timestamptz,
  done_at       timestamptz,
  check (
    (kind = 'hold' and zone_id is not null and temp is not null and minutes is not null)
    or (kind = 'cancel_hold' and zone_id is not null)
    or (kind in ('away_on', 'away_off') and zone_id is null)
  )
);

create index if not exists heating_commands_pending_idx
  on heating_commands(created_at) where status = 'pending';
create index if not exists heating_commands_recent_idx
  on heating_commands(created_at desc);

alter table heating_commands enable row level security;

drop policy if exists "heating_commands_read" on heating_commands;
create policy "heating_commands_read"
  on heating_commands for select to authenticated using (is_household());

drop policy if exists "heating_commands_admin_insert" on heating_commands;
create policy "heating_commands_admin_insert"
  on heating_commands for insert to authenticated
  with check (is_admin() and requested_by = auth.uid() and status = 'pending');


-- ─── ALERTS ────────────────────────────────────────────────────────────────

create table if not exists heating_alerts (
  id           uuid         primary key default gen_random_uuid(),
  kind         text         not null check (kind in (
                              'hub_offline', 'zone_offline', 'frost',
                              'low_battery', 'not_heating', 'empty_room_heating'
                            )),
  zone_id      uuid                 references heating_zones(id) on delete cascade,
  message      text         not null,
  opened_at    timestamptz  not null default now(),
  resolved_at  timestamptz
);

-- At most one open alert per kind + zone.
create unique index if not exists heating_alerts_one_open_idx
  on heating_alerts(kind, coalesce(zone_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where resolved_at is null;
create index if not exists heating_alerts_recent_idx
  on heating_alerts(opened_at desc);

alter table heating_alerts enable row level security;

drop policy if exists "heating_alerts_read" on heating_alerts;
create policy "heating_alerts_read"
  on heating_alerts for select to authenticated using (is_household());


-- ─── REPORTS ───────────────────────────────────────────────────────────────

create table if not exists heating_reports (
  id            uuid         primary key default gen_random_uuid(),
  period_start  date         not null,
  period_end    date         not null,
  body          text         not null check (length(body) between 1 and 20000),
  created_at    timestamptz  not null default now()
);

create index if not exists heating_reports_recent_idx
  on heating_reports(created_at desc);

alter table heating_reports enable row level security;

drop policy if exists "heating_reports_read" on heating_reports;
create policy "heating_reports_read"
  on heating_reports for select to authenticated using (is_household());


-- ─── RETENTION ─────────────────────────────────────────────────────────────
-- ~12 zones × 288 readings/day ≈ 1.3M rows/year. Keep a year of detail.
-- Called by the watchdog (db/13_heating_watchdog.sql) once a day.

create or replace function public.heating_prune_readings()
returns void
language sql
security definer
set search_path = public
as $$
  delete from heating_readings where recorded_at < now() - interval '400 days';
  delete from heating_commands where created_at < now() - interval '90 days';
$$;

revoke execute on function public.heating_prune_readings() from public, anon, authenticated;

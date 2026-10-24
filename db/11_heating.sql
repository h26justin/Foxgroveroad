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
--   heating_readings    time series for charts / Claude monitoring
--   heating_commands    admin-queued changes, picked up by the relay
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
  heat_on      boolean     not null default false
);

create index if not exists heating_readings_zone_time_idx
  on heating_readings(zone_name, recorded_at desc);
create index if not exists heating_readings_time_idx
  on heating_readings(recorded_at desc);

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
-- Alert threshold for "room is cold" pushes to admins. Edit in House info.

insert into house_settings (key, value) values
  ('heating_cold_alert_c', '12')
on conflict (key) do nothing;

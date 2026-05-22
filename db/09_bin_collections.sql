-- =============================================================================
-- FOXGROVE ROAD — BIN COLLECTION SCHEDULE (v42)
-- =============================================================================
-- Pulls the council's iCal feed once a day (cache-on-access), so the
-- dashboard can show upcoming bin collections and the cleaners get a
-- "put bins out tonight" reminder.
--
-- Source: Bromley's WasteWorks platform serves an .ics at
--   https://recyclingservices.bromley.gov.uk/waste/<UPRN>/calendar.ics
-- but the schema is generic: any iCal URL works.
-- =============================================================================

-- 1. Seed the URL slot into house_settings (idempotent — won't reset
--    an existing value).
insert into house_settings (key, value) values
  ('bin_calendar_url', '')
on conflict (key) do nothing;

-- 2. Singleton cache table. We hold the parsed events as JSONB so the
--    app can read them without re-parsing iCal on every render.
create table if not exists bin_calendar_cache (
  id           text        primary key default 'singleton',
  source_url   text,                          -- the iCal URL we pulled from
  events       jsonb       not null default '[]'::jsonb, -- [{date, summary}]
  fetched_at   timestamptz not null default now(),
  error        text,                          -- last fetch error, null on success
  updated_at   timestamptz not null default now()
);

-- Seed the singleton row so app code can use .update without first
-- checking existence.
insert into bin_calendar_cache (id) values ('singleton')
on conflict (id) do nothing;

alter table bin_calendar_cache enable row level security;

drop policy if exists "bin_cache_read" on bin_calendar_cache;
create policy "bin_cache_read"
  on bin_calendar_cache for select
  to authenticated
  using (true);  -- everyone can read; data is non-sensitive

drop policy if exists "bin_cache_admin_write" on bin_calendar_cache;
create policy "bin_cache_admin_write"
  on bin_calendar_cache for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- =============================================================================
-- FOXGROVE ROAD — GUEST ARRIVAL PACKET (v40)
-- =============================================================================
-- Two parts:
--   1. arrival_token on booking_requests — opaque per-booking URL key
--      that lets a guest see their stay info without logging in
--   2. house_settings — admin-editable bag of strings (wifi, address,
--      check-in time, fridge notes) shown on the arrival page
-- =============================================================================

-- 1. arrival_token column on booking_requests --------------------------------

alter table booking_requests
  add column if not exists arrival_token text;

create unique index if not exists booking_requests_arrival_token_uniq
  on booking_requests(arrival_token)
  where arrival_token is not null;

-- Backfill tokens for already-approved bookings so existing guests can
-- get a URL too.
update booking_requests
   set arrival_token = encode(gen_random_bytes(24), 'hex')
 where status = 'approved' and arrival_token is null;

-- Trigger: when a row transitions to 'approved' (via approve action or
-- direct insert), give it a token if it doesn't have one.
create or replace function set_arrival_token_if_approved()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'approved' and new.arrival_token is null then
    new.arrival_token := encode(gen_random_bytes(24), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists booking_requests_set_arrival_token_ins on booking_requests;
create trigger booking_requests_set_arrival_token_ins
  before insert on booking_requests
  for each row
  execute function set_arrival_token_if_approved();

drop trigger if exists booking_requests_set_arrival_token_upd on booking_requests;
create trigger booking_requests_set_arrival_token_upd
  before update on booking_requests
  for each row
  execute function set_arrival_token_if_approved();


-- 2. house_settings ---------------------------------------------------------

create table if not exists house_settings (
  key        text        primary key,
  value      text        not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid                references profiles(id) on delete set null
);

-- Seed with defaults. Admins edit via /admin/house-info. on conflict
-- means the seed is idempotent — existing values are preserved.
insert into house_settings (key, value) values
  ('address',         '34 Foxgrove Road'),
  ('wifi_ssid',       ''),
  ('wifi_password',   ''),
  ('check_in_time',   '3pm'),
  ('check_out_time',  '11am'),
  ('fridge_notes',    ''),
  ('arrival_notes',   '')
on conflict (key) do nothing;

alter table house_settings enable row level security;

drop policy if exists "house_settings_admin_read" on house_settings;
create policy "house_settings_admin_read"
  on house_settings for select
  to authenticated
  using (is_admin());

drop policy if exists "house_settings_admin_write" on house_settings;
create policy "house_settings_admin_write"
  on house_settings for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- The public arrival route uses the service-role client to read these,
-- so the absence of a "select for anon" policy is intentional.

-- =============================================================================
-- FOXGROVE ROAD — BOOKINGS FEATURE MIGRATION
-- =============================================================================
-- Run this once in the Supabase SQL Editor (Database → SQL Editor → New query).
-- It:
--   1) Adds the 'emperor' bed size to the bed_type enum
--   2) Adds is_owner_room flag to rooms
--   3) Replaces the placeholder rooms/beds with the real Foxgrove ones
--   4) Creates the booking_requests table for the family-facing flow
--   5) Creates the cleaners reference table (Linda + Sam)
--   6) Wires up RLS policies for the new tables
-- Safe to run multiple times — uses IF NOT EXISTS / ON CONFLICT where possible.
-- =============================================================================


-- 1. Add 'emperor' to the bed_type enum (it's not in the original list)
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'emperor'
      and enumtypid = (select oid from pg_type where typname = 'bed_type')
  ) then
    alter type bed_type add value 'emperor';
  end if;
end $$;


-- 2. Add owner-room flag (Master Bedroom is for Justin & wife only)
alter table rooms add column if not exists is_owner_room boolean not null default false;


-- 3. Wipe placeholder rooms/beds and seed the real Foxgrove bedrooms
--    Floor convention: 0 = Garden, 1 = 1st Floor, 2 = Attic.
--    (Cleaning task templates and tasks tied to old rooms will cascade-delete.)
delete from bookings where bed_id in (select id from beds);
delete from beds;
delete from rooms;

-- Re-seed bedrooms only. Other room types (kitchen, bathrooms, etc.) we'll
-- add later when we hook up the cleaning rota — for the booking flow we just
-- need bookable bedrooms.
insert into rooms (name, floor, is_owner_room, pos_x, pos_y, width, height) values
  ('Master Bedroom',          1, true,  50,  50, 280, 200),  -- 1st floor, owner-only
  ('1st Floor Guest King',    1, false, 350, 50, 230, 180),  -- 1st floor
  ('Garden Floor Guest',      0, false, 50, 280, 250, 180),  -- garden floor
  ('Attic King (Left)',       2, false, 50, 510, 230, 180),  -- attic
  ('Attic Twin (Right)',      2, false, 300, 510, 280, 200), -- attic, multi-bed
  ('Dormitory',               0, false, 320, 280, 260, 200); -- garden, multi-bed

-- Seed beds (one row per sleeping spot)
insert into beds (room_id, name, bed_type, pos_x, pos_y, width, height)
  select id, 'Emperor', 'emperor', 30, 50, 200, 110 from rooms where name = 'Master Bedroom';

insert into beds (room_id, name, bed_type, pos_x, pos_y, width, height)
  select id, 'King', 'king', 30, 50, 160, 110 from rooms where name = '1st Floor Guest King';

insert into beds (room_id, name, bed_type, pos_x, pos_y, width, height)
  select id, 'Super King', 'super_king', 30, 50, 180, 110 from rooms where name = 'Garden Floor Guest';

insert into beds (room_id, name, bed_type, pos_x, pos_y, width, height)
  select id, 'King', 'king', 30, 50, 160, 110 from rooms where name = 'Attic King (Left)';

-- Attic Twin (Right) has TWO beds: a king + a single
insert into beds (room_id, name, bed_type, pos_x, pos_y, width, height)
  select id, 'King', 'king', 20, 50, 160, 110 from rooms where name = 'Attic Twin (Right)';
insert into beds (room_id, name, bed_type, pos_x, pos_y, width, height)
  select id, 'Single', 'single', 200, 80, 60, 90 from rooms where name = 'Attic Twin (Right)';

-- Dormitory has TWO singles
insert into beds (room_id, name, bed_type, pos_x, pos_y, width, height)
  select id, 'Single A', 'single', 30, 50, 60, 90 from rooms where name = 'Dormitory';
insert into beds (room_id, name, bed_type, pos_x, pos_y, width, height)
  select id, 'Single B', 'single', 130, 50, 60, 90 from rooms where name = 'Dormitory';


-- 4. Booking requests — the family-facing high-level booking
do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_request_status') then
    create type booking_request_status as enum (
      'pending', 'approved', 'declined', 'cancelled'
    );
  end if;
end $$;

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references profiles(id) on delete cascade,
  check_in date not null,
  check_out date not null,
  adults int not null default 1 check (adults >= 1),
  children int not null default 0 check (children >= 0),
  notes text,
  status booking_request_status not null default 'pending',
  admin_notes text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references profiles(id),
  constraint check_request_dates check (check_out > check_in)
);

create index if not exists idx_request_status on booking_requests(status);
create index if not exists idx_request_dates on booking_requests(check_in, check_out);
create index if not exists idx_request_user on booking_requests(requested_by);

-- Link bed-level bookings back to the parent request (filled later in feature #3)
alter table bookings add column if not exists request_id uuid
  references booking_requests(id) on delete set null;


-- 5. Cleaners reference table (Linda + Sam — they don't need accounts yet)
create table if not exists public.cleaners (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  profile_id uuid references profiles(id),  -- linked once they sign up
  created_at timestamptz not null default now()
);

insert into cleaners (name) values ('Linda'), ('Sam')
on conflict (name) do nothing;


-- 6. RLS for the new tables
alter table booking_requests enable row level security;
alter table cleaners enable row level security;

-- booking_requests:
--   - family can read & insert their own, update only while pending
--   - admin sees & manages everything
drop policy if exists requests_select_own on booking_requests;
create policy requests_select_own on booking_requests for select using (
  is_admin() or requested_by = auth.uid()
);

drop policy if exists requests_insert_own on booking_requests;
create policy requests_insert_own on booking_requests for insert with check (
  requested_by = auth.uid() or is_admin()
);

drop policy if exists requests_update_pending on booking_requests;
create policy requests_update_pending on booking_requests for update using (
  requested_by = auth.uid() and status = 'pending'
) with check (
  requested_by = auth.uid() and status in ('pending', 'cancelled')
);

drop policy if exists requests_admin_all on booking_requests;
create policy requests_admin_all on booking_requests for all
  using (is_admin()) with check (is_admin());

-- cleaners: everyone can read, admin manages
drop policy if exists cleaners_read on cleaners;
create policy cleaners_read on cleaners for select
  using (auth.role() = 'authenticated');

drop policy if exists cleaners_admin on cleaners;
create policy cleaners_admin on cleaners for all
  using (is_admin()) with check (is_admin());


-- =============================================================================
-- DONE
--
-- Quick verification queries (run separately if you want to check):
--   select name, floor, is_owner_room from rooms order by floor desc, name;
--   select r.name as room, b.name as bed, b.bed_type
--     from beds b join rooms r on r.id = b.room_id
--     order by r.floor desc, r.name, b.name;
--   select * from cleaners;
-- =============================================================================

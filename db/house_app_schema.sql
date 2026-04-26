-- ============================================================================
-- HOUSE OPERATIONS APP — SUPABASE SCHEMA
-- ============================================================================
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Designed for a fresh project. Includes tables, RLS, triggers, helpers,
-- and seed data you can edit. Re-running on an existing schema will fail
-- on the create-type / create-table statements; drop them first if needed.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. PROFILES (extends auth.users)
-- ---------------------------------------------------------------------------
create type user_role as enum ('admin', 'family', 'cleaner');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'family',
  phone text,
  push_subscription jsonb,                  -- web push endpoint + keys
  created_at timestamptz not null default now()
);

-- auto-create a profile row on signup (default role = family)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'family'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- helper: is the calling user an admin / cleaner?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_cleaner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'cleaner');
$$;


-- ---------------------------------------------------------------------------
-- 2. ROOMS & BEDS  (with positions for the house map)
-- ---------------------------------------------------------------------------
-- Rooms are positioned on a "house map" canvas with arbitrary x/y/width/height.
-- Beds are positioned relative to their room, so you can render a floor plan
-- and drag bookings onto specific beds.

create type cleaning_status as enum (
  'clean',           -- empty and ready
  'occupied',        -- guest currently in
  'needs_cleaning',  -- guest just left, awaiting turnaround
  'in_progress',     -- cleaner is working on it
  'ready'            -- cleaner has marked turnaround complete
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  floor smallint default 0,
  -- canvas position (units are arbitrary — pick a scale you like)
  pos_x numeric not null default 0,
  pos_y numeric not null default 0,
  width numeric not null default 200,
  height numeric not null default 150,
  cleaning_status cleaning_status not null default 'clean',
  notes text,
  created_at timestamptz not null default now()
);

create type bed_type as enum (
  'single', 'double', 'king', 'super_king',
  'twin', 'sofa_bed', 'cot', 'bunk'
);

create table public.beds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,                         -- e.g. "Bed A", "Window single"
  bed_type bed_type not null,
  -- position relative to the room's top-left
  pos_x numeric not null default 10,
  pos_y numeric not null default 10,
  width numeric not null default 60,
  height numeric not null default 90,
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 3. BOOKINGS  (bed-level, drag-and-drop assigned)
-- ---------------------------------------------------------------------------
-- Family members create a booking with dates + guest name. status starts as
-- 'requested' and bed_id is null. Admin drags the booking onto a bed (sets
-- bed_id) and clicks Approve (sets status='approved'). The 'approved' event
-- fires the turnaround-task trigger.

create type booking_status as enum (
  'requested', 'approved', 'declined', 'cancelled', 'checked_out'
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null,                                 -- free text
  requested_by uuid references profiles(id) on delete set null,
  bed_id uuid references beds(id) on delete set null,       -- null until placed
  check_in date not null,
  check_out date not null,
  status booking_status not null default 'requested',
  notes text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references profiles(id),
  constraint check_dates check (check_out > check_in)
);

create index idx_bookings_dates on bookings(check_in, check_out);
create index idx_bookings_bed on bookings(bed_id) where bed_id is not null;
create index idx_bookings_status on bookings(status);

-- prevent double-booking the same bed across overlapping date ranges
create or replace function public.check_bed_conflict()
returns trigger language plpgsql as $$
begin
  if new.bed_id is null or new.status <> 'approved' then return new; end if;

  if exists (
    select 1 from bookings
    where bed_id = new.bed_id
      and status = 'approved'
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(check_in, check_out, '[)') &&
          daterange(new.check_in, new.check_out, '[)')
  ) then
    raise exception 'Bed % already has an approved booking overlapping these dates',
      new.bed_id;
  end if;

  return new;
end;
$$;

create trigger bookings_check_conflict
  before insert or update on bookings
  for each row execute function check_bed_conflict();


-- ---------------------------------------------------------------------------
-- 4. CLEANER SHIFTS
-- ---------------------------------------------------------------------------
create table public.cleaner_shifts (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references profiles(id) on delete cascade,
  shift_date date not null,
  start_time time,
  end_time time,
  notes text,
  created_at timestamptz not null default now(),
  unique (cleaner_id, shift_date)
);

create index idx_shifts_date on cleaner_shifts(shift_date);


-- ---------------------------------------------------------------------------
-- 5. TASK TEMPLATES & TASKS
-- ---------------------------------------------------------------------------
create type task_frequency as enum ('daily', 'weekly', 'monthly', 'turnaround', 'one_off');
create type task_status as enum ('pending', 'in_progress', 'done', 'skipped');

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  room_id uuid references rooms(id) on delete cascade,    -- null = whole house
  frequency task_frequency not null,
  default_checklist jsonb not null default '[]'::jsonb,    -- array of strings/objects
  estimated_minutes int default 15,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references task_templates(id) on delete set null,
  title text not null,                                     -- denormalised for history
  room_id uuid references rooms(id) on delete set null,
  assigned_to uuid references profiles(id) on delete set null,
  related_booking_id uuid references bookings(id) on delete set null,
  due_date date not null,
  due_time time,
  status task_status not null default 'pending',
  -- checklist is [{"item": "Strip beds", "done": false}, ...]
  checklist jsonb not null default '[]'::jsonb,
  cleaner_notes text,
  photo_urls text[],                                       -- supabase storage paths
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_tasks_assigned on tasks(assigned_to, due_date);
create index idx_tasks_due on tasks(due_date, status);


-- ---------------------------------------------------------------------------
-- 6. LINEN TRACKING
-- ---------------------------------------------------------------------------
create table public.linen_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,                  -- "King fitted sheet", "Bath towel", etc.
  total_owned int not null default 0,
  in_use int not null default 0,
  in_laundry int not null default 0,
  clean_in_storage int not null default 0,
  low_stock_threshold int not null default 2,
  notes text,
  constraint check_linen_totals
    check (in_use + in_laundry + clean_in_storage <= total_owned)
);

create table public.linen_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references linen_items(id) on delete cascade,
  change int not null,                 -- positive or negative
  from_state text,                     -- 'in_use', 'in_laundry', 'clean_in_storage'
  to_state text,
  reason text,
  task_id uuid references tasks(id) on delete set null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 7. AUTOMATION TRIGGERS
-- ---------------------------------------------------------------------------

-- 7a. When a booking is approved, create a turnaround task for check-out date.
create or replace function public.create_turnaround_task()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_room_id uuid;
  v_template task_templates%rowtype;
  v_checklist jsonb;
begin
  -- only fire on the transition into 'approved'
  if new.status <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then return new; end if;

  -- record approval metadata
  new.approved_at := now();
  new.approved_by := auth.uid();

  -- find the room from the bed
  select room_id into v_room_id from beds where id = new.bed_id;
  if v_room_id is null then return new; end if;

  -- pick a turnaround template: prefer room-specific, fall back to generic
  select * into v_template
    from task_templates
   where frequency = 'turnaround'
     and active = true
     and (room_id = v_room_id or room_id is null)
   order by (room_id = v_room_id) desc
   limit 1;

  if v_template.id is null then
    v_checklist := '[
      {"item": "Strip beds and bag linen", "done": false},
      {"item": "Remake beds with fresh linen", "done": false},
      {"item": "Replace towels", "done": false},
      {"item": "Hoover and mop floors", "done": false},
      {"item": "Clean bathroom", "done": false},
      {"item": "Restock toiletries", "done": false},
      {"item": "Empty bins", "done": false},
      {"item": "Final check", "done": false}
    ]'::jsonb;
  else
    v_checklist := v_template.default_checklist;
  end if;

  insert into tasks (template_id, title, room_id, related_booking_id,
                     due_date, checklist, status)
  values (
    v_template.id,
    'Turnaround: ' || new.guest_name,
    v_room_id,
    new.id,
    new.check_out,
    v_checklist,
    'pending'
  );

  return new;
end;
$$;

create trigger bookings_create_turnaround
  before update of status on bookings
  for each row when (new.status = 'approved')
  execute function create_turnaround_task();

create trigger bookings_create_turnaround_insert
  before insert on bookings
  for each row when (new.status = 'approved')
  execute function create_turnaround_task();


-- 7b. When a task moves to in_progress / done, update the room state.
create or replace function public.handle_task_status_change()
returns trigger language plpgsql as $$
begin
  if new.status = 'in_progress' and (old.status is distinct from 'in_progress') then
    new.started_at := coalesce(new.started_at, now());
    if new.room_id is not null then
      update rooms set cleaning_status = 'in_progress' where id = new.room_id;
    end if;
  end if;

  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
    if new.room_id is not null then
      update rooms set cleaning_status = 'ready' where id = new.room_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger tasks_status_change
  before update of status on tasks
  for each row execute function handle_task_status_change();


-- 7c. Daily housekeeping job — call from a Supabase cron (pg_cron) at, say, 06:00.
--     Marks rooms whose guests just left as needs_cleaning, and closes out
--     past approved bookings as checked_out.
create or replace function public.run_daily_rollover()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- rooms with a checkout today => needs_cleaning
  update rooms r
     set cleaning_status = 'needs_cleaning'
   where r.id in (
     select bd.room_id
       from bookings b
       join beds bd on bd.id = b.bed_id
      where b.status = 'approved'
        and b.check_out = current_date
   );

  -- rooms with a check-in today and no later overlap => occupied
  update rooms r
     set cleaning_status = 'occupied'
   where r.id in (
     select bd.room_id
       from bookings b
       join beds bd on bd.id = b.bed_id
      where b.status = 'approved'
        and b.check_in <= current_date
        and b.check_out > current_date
   );

  -- close out past approved bookings
  update bookings
     set status = 'checked_out'
   where status = 'approved'
     and check_out < current_date;
end;
$$;


-- ---------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table rooms enable row level security;
alter table beds enable row level security;
alter table bookings enable row level security;
alter table cleaner_shifts enable row level security;
alter table task_templates enable row level security;
alter table tasks enable row level security;
alter table linen_items enable row level security;
alter table linen_movements enable row level security;

-- profiles
create policy profiles_select on profiles for select
  using (id = auth.uid() or is_admin());
create policy profiles_update_self on profiles for update
  using (id = auth.uid());
create policy profiles_admin_all on profiles for all
  using (is_admin()) with check (is_admin());

-- rooms / beds: any authenticated user can read; only admin writes
create policy rooms_read on rooms for select using (auth.role() = 'authenticated');
create policy rooms_admin on rooms for all using (is_admin()) with check (is_admin());

create policy beds_read on beds for select using (auth.role() = 'authenticated');
create policy beds_admin on beds for all using (is_admin()) with check (is_admin());

-- bookings:
--  - family sees their own + all approved/checked_out (so they can see who's in)
--  - cleaners see approved/checked_out (so they know who's coming)
--  - admin sees everything
create policy bookings_select on bookings for select using (
  is_admin()
  or requested_by = auth.uid()
  or status in ('approved', 'checked_out')
);
create policy bookings_insert on bookings for insert with check (
  requested_by = auth.uid() or is_admin()
);
create policy bookings_update_own_pending on bookings for update using (
  requested_by = auth.uid() and status = 'requested'
);
create policy bookings_admin on bookings for all
  using (is_admin()) with check (is_admin());

-- cleaner shifts
create policy shifts_select on cleaner_shifts for select
  using (cleaner_id = auth.uid() or is_admin());
create policy shifts_admin on cleaner_shifts for all
  using (is_admin()) with check (is_admin());

-- task templates: read-all, admin writes
create policy templates_read on task_templates for select
  using (auth.role() = 'authenticated');
create policy templates_admin on task_templates for all
  using (is_admin()) with check (is_admin());

-- tasks: cleaners see + update their own; admin sees everything
create policy tasks_select on tasks for select
  using (assigned_to = auth.uid() or is_admin());
create policy tasks_update_own on tasks for update
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());
create policy tasks_admin on tasks for all
  using (is_admin()) with check (is_admin());

-- linen
create policy linen_items_read on linen_items for select
  using (auth.role() = 'authenticated');
create policy linen_items_admin on linen_items for all
  using (is_admin()) with check (is_admin());
create policy linen_movements_read on linen_movements for select
  using (auth.role() = 'authenticated');
create policy linen_movements_admin on linen_movements for all
  using (is_admin()) with check (is_admin());


-- ---------------------------------------------------------------------------
-- 9. EXAMPLE SEED DATA — edit to match your house, then run.
-- ---------------------------------------------------------------------------
-- After your first signup, promote your own profile to admin:
--   update profiles set role = 'admin' where id = '<your-auth-user-id>';

insert into rooms (name, floor, pos_x, pos_y, width, height) values
  ('Master Bedroom', 1,  50,  50, 250, 200),
  ('Guest Room 1',   1, 320,  50, 200, 180),
  ('Guest Room 2',   1, 540,  50, 200, 180),
  ('Twin Room',      1,  50, 270, 220, 180),
  ('Box Room',       1, 290, 270, 160, 150);

insert into beds (room_id, name, bed_type, pos_x, pos_y)
  select id, 'King',   'king',   30, 50 from rooms where name = 'Master Bedroom';
insert into beds (room_id, name, bed_type, pos_x, pos_y)
  select id, 'Double', 'double', 30, 50 from rooms where name = 'Guest Room 1';
insert into beds (room_id, name, bed_type, pos_x, pos_y)
  select id, 'Double', 'double', 30, 50 from rooms where name = 'Guest Room 2';
insert into beds (room_id, name, bed_type, pos_x, pos_y)
  select id, 'Twin A', 'single', 20, 50 from rooms where name = 'Twin Room';
insert into beds (room_id, name, bed_type, pos_x, pos_y)
  select id, 'Twin B', 'single',110, 50 from rooms where name = 'Twin Room';
insert into beds (room_id, name, bed_type, pos_x, pos_y)
  select id, 'Single', 'single', 30, 40 from rooms where name = 'Box Room';

-- one turnaround template per room (room-specific, falls back to generic if absent)
insert into task_templates (name, room_id, frequency, default_checklist, estimated_minutes)
select 'Turnaround — ' || name, id, 'turnaround',
  '[
    {"item":"Strip beds + bag linen","done":false},
    {"item":"Remake beds with fresh linen","done":false},
    {"item":"Replace towels","done":false},
    {"item":"Hoover and mop","done":false},
    {"item":"Wipe surfaces","done":false},
    {"item":"Clean bathroom","done":false},
    {"item":"Restock toiletries","done":false},
    {"item":"Empty bins","done":false},
    {"item":"Final check + mark ready","done":false}
  ]'::jsonb,
  45
from rooms;

-- linen starter set — adjust to your actual stock
insert into linen_items (name, total_owned, clean_in_storage, low_stock_threshold) values
  ('King fitted sheet',     4,  4, 2),
  ('King duvet cover',      4,  4, 2),
  ('King pillowcase',      12, 12, 4),
  ('Double fitted sheet',   6,  6, 2),
  ('Double duvet cover',    6,  6, 2),
  ('Double pillowcase',    12, 12, 4),
  ('Single fitted sheet',   6,  6, 2),
  ('Single duvet cover',    6,  6, 2),
  ('Bath towel',           20, 20, 6),
  ('Hand towel',           15, 15, 4);

-- ============================================================================
-- DONE. Next steps:
--   1) Promote yourself to admin (see comment under section 9).
--   2) Schedule run_daily_rollover() via Supabase Database → Cron, e.g. 06:00 UTC.
--   3) Generate TypeScript types:  supabase gen types typescript --project-id <id>
-- ============================================================================

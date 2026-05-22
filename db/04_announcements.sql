-- =============================================================================
-- FOXGROVE ROAD — IN-APP ANNOUNCEMENTS (v37)
-- =============================================================================
-- Lightweight site-wide banner system. Admin posts a short message;
-- every user sees a dismissible banner across the authed app shell.
--
-- One active announcement at a time is the practical UX; the schema
-- allows multiple just so the "is_active" toggle on the previous one
-- can be flipped off explicitly without deleting it.
-- =============================================================================

-- 1. Tables -------------------------------------------------------------------

create table if not exists announcements (
  id          uuid        primary key default gen_random_uuid(),
  body        text        not null check (length(body) > 0 and length(body) <= 500),
  created_by  uuid        not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  is_active   boolean     not null default true,
  dismissible boolean     not null default true
);

create index if not exists announcements_active_idx
  on announcements(created_at desc)
  where is_active = true;

create table if not exists announcement_dismissals (
  announcement_id uuid        not null references announcements(id) on delete cascade,
  user_id         uuid        not null references profiles(id) on delete cascade,
  dismissed_at    timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- 2. RLS ----------------------------------------------------------------------

alter table announcements enable row level security;
alter table announcement_dismissals enable row level security;

-- Anyone signed in can read announcements (banner needs to be visible
-- to everyone). is_active filtering is the app's job.
drop policy if exists "announcements_read" on announcements;
create policy "announcements_read"
  on announcements for select
  to authenticated
  using (true);

-- Only admins can write announcements.
drop policy if exists "announcements_admin_write" on announcements;
create policy "announcements_admin_write"
  on announcements for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- Users can read their own dismissals.
drop policy if exists "dismissals_read" on announcement_dismissals;
create policy "dismissals_read"
  on announcement_dismissals for select
  to authenticated
  using (user_id = auth.uid());

-- Users can insert/delete their own dismissals.
drop policy if exists "dismissals_insert" on announcement_dismissals;
create policy "dismissals_insert"
  on announcement_dismissals for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "dismissals_delete" on announcement_dismissals;
create policy "dismissals_delete"
  on announcement_dismissals for delete
  to authenticated
  using (user_id = auth.uid());

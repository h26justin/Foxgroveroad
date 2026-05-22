-- =============================================================================
-- FOXGROVE ROAD — CLEANER SELF-LOGGED HOURS (v41)
-- =============================================================================
-- Cleaners record their own hours per session via a form on /housekeeping.
-- Admin's weekly /pay entry can pre-fill from these logs (still admin's
-- choice to apply / override).
--
-- Why a separate table from `cleaner_hours`:
--   - cleaner_hours is the AUTHORITATIVE weekly total (rate snapshots,
--     bonus calc, etc). Once admin finalises a week, it's an invoice
--     line item.
--   - cleaner_hour_logs is the GRANULAR source data (daily, with notes).
--     Used to suggest values for the weekly form.
-- =============================================================================

create table if not exists cleaner_hour_logs (
  id          uuid          primary key default gen_random_uuid(),
  cleaner_id  uuid          not null references cleaners(id) on delete cascade,
  date        date          not null,
  hours       numeric(4,2)  not null check (hours > 0 and hours <= 24),
  notes       text,
  logged_by   uuid                  references profiles(id) on delete set null,
  logged_at   timestamptz   not null default now()
);

create index if not exists cleaner_hour_logs_cleaner_date_idx
  on cleaner_hour_logs(cleaner_id, date);

create index if not exists cleaner_hour_logs_date_idx
  on cleaner_hour_logs(date desc);

alter table cleaner_hour_logs enable row level security;

-- A cleaner can read/insert/delete logs that belong to THEIR cleaner row.
-- Admin can do anything.

drop policy if exists "logs_read" on cleaner_hour_logs;
create policy "logs_read" on cleaner_hour_logs
  for select to authenticated using (
    is_admin()
    or cleaner_id in (select id from cleaners where profile_id = auth.uid())
  );

drop policy if exists "logs_insert" on cleaner_hour_logs;
create policy "logs_insert" on cleaner_hour_logs
  for insert to authenticated with check (
    is_admin()
    or cleaner_id in (select id from cleaners where profile_id = auth.uid())
  );

drop policy if exists "logs_delete" on cleaner_hour_logs;
create policy "logs_delete" on cleaner_hour_logs
  for delete to authenticated using (
    is_admin()
    or cleaner_id in (select id from cleaners where profile_id = auth.uid())
  );

drop policy if exists "logs_admin_update" on cleaner_hour_logs;
create policy "logs_admin_update" on cleaner_hour_logs
  for update to authenticated using (is_admin()) with check (is_admin());

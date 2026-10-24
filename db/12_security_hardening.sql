-- =============================================================================
-- FOXGROVE ROAD — SECURITY HARDENING (v48)
-- =============================================================================
-- 1. Users could change their own profiles.role (e.g. to 'admin') through
--    the API: profiles_update_self had no WITH CHECK and every column was
--    updatable. A guard trigger now blocks self-changes to role / is_deleted
--    / id / created_at unless the caller is an admin or the service role.
-- 2. New sign-ups defaulted to 'family' in handle_new_user(); the app then
--    tried to flip them to 'pending' and swallowed any failure. The trigger
--    now creates them as 'pending' directly.
-- 3. Many read policies were `using (true)` / `auth.role() = 'authenticated'`,
--    so an unapproved ('pending') account could read chat, expenses,
--    contacts, wiki etc. straight from the API. They now require
--    is_approved().
-- 4. Bed assignment did delete-then-insert as two calls; a failed insert
--    lost the existing assignment. fg_replace_bed_assignments() does both
--    in one transaction.
-- 5. Arrival packets: tokens now expire 3 days after check-out (checked in
--    the app) and can be regenerated.
--
-- Supersedes the matching policies in 04, 09 and 10. Run once in the
-- Supabase SQL Editor. Safe to re-run.
-- =============================================================================

-- ─── 1. HELPERS ────────────────────────────────────────────────────────────

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from profiles
     where id = auth.uid()
       and role <> 'pending'
       and is_deleted = false
  );
$$;

-- ─── 2. PROFILE SELF-ESCALATION GUARD ──────────────────────────────────────

create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Service role (server actions using SUPABASE_SERVICE_ROLE_KEY) and
  -- direct SQL (no JWT) are trusted. Admins can change anyone.
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' or is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.is_deleted is distinct from old.is_deleted
     or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'Only an admin can change role or account status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard
  before update on profiles
  for each row execute function public.profiles_guard();

drop policy if exists "profiles_update_self" on profiles;
create policy "profiles_update_self"
  on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─── 3. SIGN-UPS START AS PENDING ──────────────────────────────────────────
-- Admin invites still get their chosen role: invite-actions.ts upserts it
-- with the service role straight after the user is created.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'pending'
  );
  return new;
end;
$$;

-- ─── 4. READS REQUIRE AN APPROVED ACCOUNT ──────────────────────────────────

drop policy if exists "announcements_read" on announcements;
create policy "announcements_read" on announcements
  for select to authenticated using (is_approved());

drop policy if exists "beds_read" on beds;
create policy "beds_read" on beds
  for select to authenticated using (is_approved());

drop policy if exists "bin_cache_read" on bin_calendar_cache;
create policy "bin_cache_read" on bin_calendar_cache
  for select to authenticated using (is_approved());

drop policy if exists "brc readable" on booking_request_children;
create policy "brc readable" on booking_request_children
  for select to authenticated using (is_approved());

drop policy if exists "bookings_select" on bookings;
create policy "bookings_select" on bookings
  for select to authenticated using (
    is_admin()
    or requested_by = auth.uid()
    or (is_approved() and status in ('approved', 'checked_out'))
  );

drop policy if exists "cleaners_read" on cleaners;
create policy "cleaners_read" on cleaners
  for select to authenticated using (is_approved());

drop policy if exists "contacts_read" on contacts;
create policy "contacts_read" on contacts
  for select to authenticated using (is_approved());

drop policy if exists "expenses_read" on expenses;
create policy "expenses_read" on expenses
  for select to authenticated using (is_approved());

drop policy if exists "feature_flags_select" on feature_flags;
create policy "feature_flags_select" on feature_flags
  for select to authenticated using (is_approved());

drop policy if exists "linen_items_read" on linen_items;
create policy "linen_items_read" on linen_items
  for select to authenticated using (is_approved());

drop policy if exists "linen_movements_read" on linen_movements;
create policy "linen_movements_read" on linen_movements
  for select to authenticated using (is_approved());

drop policy if exists "linen readable" on room_linen;
create policy "linen readable" on room_linen
  for select to authenticated using (is_approved());

drop policy if exists "messages_read" on messages;
create policy "messages_read" on messages
  for select to authenticated using (is_approved());

drop policy if exists "pc readable" on prearrival_checks;
create policy "pc readable" on prearrival_checks
  for select to authenticated using (is_approved());

drop policy if exists "pt readable" on prearrival_templates;
create policy "pt readable" on prearrival_templates
  for select to authenticated using (is_approved());

drop policy if exists "plant_waterings_select" on plant_waterings;
create policy "plant_waterings_select" on plant_waterings
  for select to authenticated using (is_approved());

drop policy if exists "plants_select" on plants;
create policy "plants_select" on plants
  for select to authenticated using (is_approved());

drop policy if exists "rooms_read" on rooms;
create policy "rooms_read" on rooms
  for select to authenticated using (is_approved());

drop policy if exists "completions readable by authed users" on task_completions;
create policy "completions readable by authed users" on task_completions
  for select to authenticated using (is_approved());

drop policy if exists "templates_read" on task_templates;
create policy "templates_read" on task_templates
  for select to authenticated using (is_approved());

drop policy if exists "wiki_pages_read" on wiki_pages;
create policy "wiki_pages_read" on wiki_pages
  for select to authenticated using (is_approved());

-- ─── 5. WRITES REQUIRE AN APPROVED ACCOUNT ─────────────────────────────────

drop policy if exists "messages_insert" on messages;
create policy "messages_insert" on messages
  for insert to authenticated
  with check (author_id = auth.uid() and is_approved());

drop policy if exists "requests_insert_own" on booking_requests;
create policy "requests_insert_own" on booking_requests
  for insert to authenticated
  with check ((requested_by = auth.uid() and is_approved()) or is_admin());

drop policy if exists "bookings_insert" on bookings;
create policy "bookings_insert" on bookings
  for insert to authenticated
  with check ((requested_by = auth.uid() and is_approved()) or is_admin());

drop policy if exists "fg_attachments_storage_insert" on storage.objects;
create policy "fg_attachments_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and is_approved());

-- ─── 6. ATOMIC BED ASSIGNMENT ──────────────────────────────────────────────
-- Security invoker: RLS still applies, so only admins get past the
-- bookings_admin policy. The overlap trigger raising rolls back the
-- delete too.

create or replace function public.fg_replace_bed_assignments(
  p_request_id uuid,
  p_bed_ids    uuid[]
)
returns int
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  r booking_requests%rowtype;
  v_guest text;
  v_count int;
begin
  if not is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select * into r from booking_requests where id = p_request_id;
  if not found then
    raise exception 'Request not found';
  end if;
  if r.status <> 'approved' then
    raise exception 'Approve the request before assigning beds.';
  end if;

  select coalesce(full_name, 'Family guest') into v_guest
    from profiles where id = r.requested_by;

  delete from bookings where request_id = p_request_id;

  insert into bookings (
    bed_id, request_id, requested_by, guest_name,
    check_in, check_out, status, approved_at, approved_by
  )
  select distinct b, p_request_id, r.requested_by, coalesce(v_guest, 'Family guest'),
         r.check_in, r.check_out, 'approved', now(), auth.uid()
    from unnest(coalesce(p_bed_ids, '{}')) as b;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.fg_replace_bed_assignments(uuid, uuid[]) from anon, public;
grant execute on function public.fg_replace_bed_assignments(uuid, uuid[]) to authenticated;

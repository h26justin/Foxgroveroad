-- =============================================================================
-- FOXGROVE ROAD — SECURITY HARDENING
-- =============================================================================
-- Closes three gaps found in review (2026-10-24), each checked against the
-- live database:
--
--   1. `profiles_update_self` lets a user update ANY column of their own row,
--      including `role` and `is_deleted`. With the public anon key anyone
--      signed in could run `update profiles set role = 'admin'` over the REST
--      API. A trigger now refuses role / is_deleted changes unless the caller
--      is an admin or the service role.
--   2. `handle_new_user` gave new auth users the 'family' role. The app's
--      signup action downgrades them to 'pending', but calling
--      `auth.signUp` directly skipped that. New users now start 'pending';
--      invites still set their role with the service-role client.
--   3. `requests_insert_own` didn't limit `status`, so a user could insert a
--      booking request that was already 'approved' (and get an arrival packet
--      with the wifi password). Non-admins may now only insert 'pending'.
--
-- Run once in Supabase SQL Editor. Safe to re-run.
-- =============================================================================

-- ─── 1. Lock role / is_deleted ─────────────────────────────────────────────

create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role (server actions using createAdminClient) has no auth.uid().
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only an admin can change a role' using errcode = '42501';
  end if;
  if new.is_deleted is distinct from old.is_deleted then
    raise exception 'Only an admin can delete or restore a user' using errcode = '42501';
  end if;
  if new.id is distinct from old.id then
    raise exception 'Profile id cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on profiles;
create trigger profiles_guard_privileged_columns
  before update on profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- Belt and braces: the self-update policy also pins the row to the caller.
drop policy if exists "profiles_update_self" on profiles;
create policy "profiles_update_self"
  on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());


-- ─── 2. New users start pending ────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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


-- ─── 3. Booking requests are inserted as pending ───────────────────────────

drop policy if exists "requests_insert_own" on booking_requests;
create policy "requests_insert_own"
  on booking_requests for insert to authenticated
  with check (
    is_admin()
    or (requested_by = auth.uid() and status = 'pending')
  );

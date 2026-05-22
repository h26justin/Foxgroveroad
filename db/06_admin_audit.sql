-- =============================================================================
-- FOXGROVE ROAD — ADMIN AUDIT LOG (v39)
-- =============================================================================
-- Append-only log of destructive/sensitive admin actions: user deletes,
-- email rotations, role changes, bans, booking approvals/cancels.
--
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================

create table if not exists admin_audit (
  id          uuid        primary key default gen_random_uuid(),
  actor_id    uuid                references profiles(id) on delete set null,
  action      text        not null,           -- e.g. 'user.delete', 'user.email.update'
  target_kind text,                            -- e.g. 'user', 'booking', 'announcement'
  target_id   uuid,                            -- the row affected (may be null)
  payload     jsonb       not null default '{}'::jsonb, -- before/after / metadata
  created_at  timestamptz not null default now()
);

create index if not exists admin_audit_created_idx
  on admin_audit(created_at desc);

create index if not exists admin_audit_actor_idx
  on admin_audit(actor_id, created_at desc);

create index if not exists admin_audit_target_idx
  on admin_audit(target_kind, target_id);

-- RLS: admins read all, admins insert (service-role bypasses RLS, so
-- writes from server actions work either way).
alter table admin_audit enable row level security;

drop policy if exists "admin_audit_admin_read" on admin_audit;
create policy "admin_audit_admin_read"
  on admin_audit for select
  to authenticated
  using (is_admin());

drop policy if exists "admin_audit_admin_insert" on admin_audit;
create policy "admin_audit_admin_insert"
  on admin_audit for insert
  to authenticated
  with check (is_admin());

-- No update/delete policies — audit log is append-only.

-- =============================================================================
-- FOXGROVE ROAD — LOCK DOWN INTERNAL FUNCTIONS (v49)
-- =============================================================================
-- Supabase's security advisor flagged SECURITY DEFINER functions that
-- anyone (even signed out) could call directly via /rest/v1/rpc/...
--
-- - run_daily_rollover(): flips room cleaning status and marks bookings
--   checked out. Nothing in the app or a cron job calls it; it should
--   only ever be run from the SQL editor.
-- - Trigger functions (handle_new_user, profiles_guard,
--   create_turnaround_task) and the rls_auto_enable event trigger: these
--   only make sense when Postgres fires them, and triggers don't need
--   the caller to hold EXECUTE.
--
-- is_admin() / is_approved() / is_cleaner() are deliberately left
-- callable: RLS policies run them as the requesting user.
--
-- Run once in Supabase SQL Editor. Safe to re-run.
-- =============================================================================

revoke execute on function public.run_daily_rollover()     from public, anon, authenticated;
revoke execute on function public.handle_new_user()        from public, anon, authenticated;
revoke execute on function public.profiles_guard()         from public, anon, authenticated;
revoke execute on function public.create_turnaround_task() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()        from public, anon, authenticated;

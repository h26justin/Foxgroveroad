-- =============================================================================
-- FOXGROVE ROAD — HEATING WATCHDOG (optional, recommended)
-- =============================================================================
-- Alerts are worked out whenever the bridge checks in. The one alert that
-- can't be raised that way is "the bridge / hub has gone quiet" — so this
-- asks the app to check every 10 minutes from Supabase itself.
--
-- Before running:
--   1. Set CRON_SECRET in Vercel (any long random string) and redeploy.
--   2. Supabase → Project Settings → Vault → add two secrets:
--        heating_check_url     https://<your-domain>/api/heating/check
--        heating_check_secret  the same value as CRON_SECRET
--
-- Then run this once in the SQL Editor. Safe to re-run.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job
 where jobname in ('heating-watchdog', 'heating-prune');

select cron.schedule(
  'heating-watchdog',
  '*/10 * * * *',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'heating_check_url'),
      headers := jsonb_build_object(
        'authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'heating_check_secret')
      ),
      body    := '{}'::jsonb
    );
  $$
);

select cron.schedule('heating-prune', '17 3 * * *', $$ select public.heating_prune_readings(); $$);

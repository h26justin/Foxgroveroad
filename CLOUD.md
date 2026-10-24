# Running Foxgroveroad in Claude Code cloud sessions

Cloud sessions run in a fresh container cloned from `h26justin/Foxgroveroad`.
The repo prepares the container itself; the only manual step is creating the
environment once on claude.ai.

## What the repo does automatically

`.claude/settings.json` registers a SessionStart hook that runs
`scripts/cloud-session-start.sh`. When `CLAUDE_CODE_REMOTE=true` (cloud only) it:

- runs `npm ci` (skipped if `node_modules` already matches the lockfile)
- sets placeholder `NEXT_PUBLIC_SUPABASE_*` values when none are configured, so
  `npm run build` / `npm run lint` work without real credentials
- disables Next.js telemetry

Local sessions skip the script.

## One-time: create the cloud environment

At claude.ai/code → environment picker → **Add environment**:

1. **Name:** `Foxgroveroad`
2. **Network access:** *Trusted* is enough for `npm ci` and builds. If cloud
   sessions should reach the live app's services, choose *Custom* and add
   `*.supabase.co` (and `api.resend.com` for email).
3. **Environment variables** (`.env` format). Add only what cloud work needs:

| Variable | Needed for | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | real data in dev server | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | real data in dev server | public, RLS-limited |
| `NEXT_PUBLIC_SITE_URL` | links in emails / arrival packets | |
| `SUPABASE_SERVICE_ROLE_KEY` | admin server actions | **bypasses RLS — leave out unless a task needs it** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | web push | optional |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | email mirror | optional; cloud sessions could send real email |
| `HEATING_BRIDGE_TOKEN` | heating bridge check-ins (`/api/heating/bridge`) | secret; same value on the Pi (`bridge/heatmiser/.env`) |
| `CRON_SECRET` | heating watchdog (`/api/heating/check`) | secret; also stored in Supabase Vault, see `db/13_heating_watchdog.sql` |

Copy values from the Vercel project settings — never paste them into code or chat.

Nothing else needs migrating: database schema lives in `db/`, Supabase and
Vercel are already hosted, and secrets stay in the environment settings.

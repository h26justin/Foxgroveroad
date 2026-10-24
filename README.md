# Foxgrove Road

Private house-management app for Foxgrove Road: family bedroom bookings,
housekeeping and cleaner tasks, linen, cleaner pay, issues, guests, bins,
plants, chat, wiki, contacts, expenses, guest arrival packets, calendar
feeds and heating (Heatmiser).

- **Live:** https://foxgroveroad.vercel.app (Vercel project `foxgroveroad`,
  auto-deploys from `main`)
- **Database / auth / storage:** Supabase project "Foxgrove Road" (eu-west-3)
- **Stack:** Next.js 16 (App Router, `proxy.ts` instead of middleware),
  React 19, Tailwind 4, Supabase (`@supabase/ssr`), web push, Resend email

> This Next.js version has breaking changes from older docs — see
> `AGENTS.md` and `node_modules/next/dist/docs/`.

## Local development

```bash
npm ci
# create .env.local with the variables below (copy values from Vercel)
npm run dev    # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (`tests/`), incl. heating SQL in PGlite |
| `npm run build` | Production build |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on
every pull request.

### Environment variables

Set in Vercel → Settings → Environment Variables. Never commit them.

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | everything |
| `SUPABASE_SERVICE_ROLE_KEY` | admin actions, invites, arrival packets, calendar feeds, heating sync (server-only, bypasses RLS) |
| `NEXT_PUBLIC_SITE_URL` | links in emails and pushes |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | web push |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | email mirror of notifications |
| `HEATING_RELAY_SECRET` | heating relay → `/api/heating/sync` (32+ random chars) |

Cloud (Claude Code) sessions: see `CLOUD.md`.

## Database

SQL lives in `db/` and is run by hand in the Supabase SQL editor, in
number order. Every file is safe to re-run.

| File | Contents |
|---|---|
| `00_base_schema.sql` | **Reference snapshot** of the whole live schema (tables, RLS policies, functions, triggers). Don't run it on the existing database. |
| `02`–`10` | Incremental features (bookings, calendar feeds, announcements, indexes, audit, arrival packets, cleaner self-logs, bins, feature pack) |
| `11_heating.sql` | Heatmiser zones, 5-minute readings, daily roll-up, thermal model, command queue |
| `12_security_hardening.sql` | Approval gate on RLS, profile role guard, pending sign-ups, atomic bed assignment |
| `13_function_grants.sql` | Stops internal/trigger functions being callable through the API |

After a schema change, regenerate `lib/supabase/database.types.ts`
(Supabase CLI `supabase gen types typescript`, or the Supabase MCP
`generate_typescript_types`) and refresh `00_base_schema.sql`.

## Accounts and roles

Roles: `admin`, `family`, `cleaner`, `pending`. Anyone can sign up; new
accounts are `pending` (enforced by the `handle_new_user` trigger) and can
see nothing until an admin approves them on **Team**. Admins can also
invite people directly with a role. Users can't change their own role —
a database trigger blocks it.

## Heating

The Heatmiser neoHub is only reachable on the house network, so a small
relay runs on an always-on device at the house and syncs with the app.
See `heating-relay/README.md` for setup. The Heating page (admin, More →
Heating) shows each room, lets admins change targets/holds/frost/away,
and — after a few days of readings — predicts heating hours and warm-up
times from each room's learned heat loss and the outdoor temperature.

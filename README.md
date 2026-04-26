# Foxgrove Road — setup walkthrough

Goal of this pass: empty repo → working app where you can sign up, log in, and land on a role-aware dashboard, deployed on Vercel.

## Order of operations

1. [Create the Supabase project](#1-supabase)
2. [Run the SQL schema](#2-schema)
3. [Scaffold the Next.js app locally](#3-nextjs)
4. [Drop these starter files in](#4-files)
5. [Wire up environment variables](#5-env)
6. [Run it locally](#6-run)
7. [Sign up + promote yourself to admin](#7-admin)
8. [Push to GitHub and add env vars to Vercel](#8-deploy)

---

## 1. Supabase

Go to [supabase.com](https://supabase.com), New Project. Pick the EU (London) region for lowest latency. Strong DB password — save it somewhere. Wait ~2 minutes for it to spin up.

Once it's live, grab two values from **Project Settings → API**:

- `Project URL` → this becomes `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key → this becomes `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Then turn off email confirmation for development: **Authentication → Sign In / Providers → Email → Confirm email: OFF**. Turn it back on before you go live.

## 2. Schema

In the Supabase dashboard, go to **SQL Editor** → New query. Paste the contents of `db/house_app_schema.sql` (included in this starter) and run. You should see "Success. No rows returned." If it errors, share the error and we'll fix it.

## 3. Next.js

In your local clone of the empty `FoxgroveRoad` repo:

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias="@/*"
```

Say yes to overwriting if it asks (the repo's empty anyway). Then install Supabase:

```bash
npm install @supabase/supabase-js @supabase/ssr
```

## 4. Files

Drop the contents of this starter into your repo. The structure mirrors what `create-next-app` made — overwrite the generated `app/page.tsx` and `app/layout.tsx`. The new files are:

```
middleware.ts
lib/supabase/client.ts
lib/supabase/server.ts
lib/supabase/middleware.ts
lib/auth.ts
app/page.tsx                 (overwrites the default)
app/layout.tsx               (overwrites the default)
app/login/page.tsx
app/login/actions.ts
app/signup/page.tsx
app/signup/actions.ts
app/logout/route.ts
app/auth/callback/route.ts
app/(app)/layout.tsx
app/(app)/dashboard/page.tsx
.env.local.example
db/house_app_schema.sql
```

## 5. Env

Copy `.env.local.example` to `.env.local` and fill in your two Supabase values:

```bash
cp .env.local.example .env.local
```

Don't commit `.env.local` — it's already in the default `.gitignore` from `create-next-app`.

## 6. Run

```bash
npm run dev
```

Open http://localhost:3000 — you should be redirected to `/login`.

## 7. Admin

Click "Create one" on the login page → sign up with your email and a password. You'll get logged in and redirected to `/dashboard`, where it'll say your role is `family`.

Now make yourself admin. Open the Supabase dashboard → **SQL Editor** and run:

```sql
update profiles set role = 'admin' where full_name = '<your email or name>';
-- or by email:
update profiles set role = 'admin'
 where id = (select id from auth.users where email = 'you@example.com');
```

Refresh the dashboard — your role chip now says `admin`.

## 8. Deploy

```bash
git add .
git commit -m "Initial scaffold + auth"
git push
```

Vercel will auto-deploy. Then in **Vercel → project-1oc0j → Settings → Environment Variables**, add the same two vars (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`) for Production / Preview / Development. Hit Redeploy on the latest deployment so it picks them up.

You're done with plumbing. Next pass we'll build the family booking form and the house-map drag-and-drop view against this foundation.

---

## What you have once this is done

- Three roles working: `admin`, `family`, `cleaner`
- Anyone can sign up; defaults to `family`
- You promote cleaners to `cleaner` role manually for now (same SQL pattern as step 7)
- Routes under `app/(app)/...` are protected by middleware — unauthed users get bounced to `/login`
- The dashboard already branches on role, so when we add the family booking form / cleaner today list / admin map, they slot into the existing shell without changes here.

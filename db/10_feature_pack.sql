-- =============================================================================
-- FOXGROVE ROAD — FEATURE PACK (v46): expenses, contacts, chat, wiki, prefs
-- =============================================================================
-- One migration that adds the schema for five new features. Each feature
-- is gated by a per-user preference so individuals can hide what they
-- don't care about.
--
-- Run once in Supabase SQL Editor. Safe to re-run.
-- =============================================================================

-- ─── 1. EXPENSES ───────────────────────────────────────────────────────────
-- Ledger of house costs (utilities, repairs, supplies, council tax). Optional
-- link to a booking_request so per-stay totals are possible later.

create table if not exists expenses (
  id            uuid           primary key default gen_random_uuid(),
  date          date           not null,
  amount_pence  bigint         not null check (amount_pence >= 0),
  currency      text           not null default 'GBP' check (length(currency) = 3),
  category      text           not null check (category in (
                                'utilities', 'repairs', 'supplies',
                                'council_tax', 'insurance', 'cleaning_supply',
                                'other'
                              )),
  description   text           not null check (length(description) > 0 and length(description) <= 500),
  paid_by       uuid                   references profiles(id) on delete set null,
  booking_request_id uuid              references booking_requests(id) on delete set null,
  created_by    uuid                   references profiles(id) on delete set null,
  created_at    timestamptz    not null default now()
);

create index if not exists expenses_date_idx on expenses(date desc);
create index if not exists expenses_category_idx on expenses(category, date desc);
create index if not exists expenses_booking_idx on expenses(booking_request_id) where booking_request_id is not null;

alter table expenses enable row level security;

drop policy if exists "expenses_read" on expenses;
create policy "expenses_read"
  on expenses for select to authenticated using (true);

drop policy if exists "expenses_write" on expenses;
create policy "expenses_write"
  on expenses for insert to authenticated with check (
    is_admin() or exists (
      select 1 from profiles where id = auth.uid() and role in ('admin', 'family')
    )
  );

drop policy if exists "expenses_update" on expenses;
create policy "expenses_update"
  on expenses for update to authenticated
  using (is_admin() or created_by = auth.uid())
  with check (is_admin() or created_by = auth.uid());

drop policy if exists "expenses_delete" on expenses;
create policy "expenses_delete"
  on expenses for delete to authenticated
  using (is_admin() or created_by = auth.uid());


-- ─── 2. CONTACTS ───────────────────────────────────────────────────────────
-- Local services + neighbours. Admin curates; everyone reads.

create table if not exists contacts (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (length(name) > 0 and length(name) <= 200),
  kind        text        not null check (kind in (
                            'plumber', 'electrician', 'locksmith', 'neighbour',
                            'gp', 'cleaner', 'gardener', 'handyman', 'other'
                          )),
  phone       text,
  email       text,
  notes       text,
  is_pinned   boolean     not null default false,
  created_by  uuid                references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists contacts_pinned_kind_idx on contacts(is_pinned desc, kind, name);

alter table contacts enable row level security;

drop policy if exists "contacts_read" on contacts;
create policy "contacts_read"
  on contacts for select to authenticated using (true);

drop policy if exists "contacts_admin_write" on contacts;
create policy "contacts_admin_write"
  on contacts for all to authenticated
  using (is_admin()) with check (is_admin());


-- ─── 3. CHAT MESSAGES ──────────────────────────────────────────────────────
-- One general "house" thread plus optional per-booking threads. Everyone
-- can post + read; users can delete their own; admin can delete any.

create table if not exists messages (
  id                 uuid        primary key default gen_random_uuid(),
  scope              text        not null check (scope in ('general', 'booking')),
  booking_request_id uuid                references booking_requests(id) on delete cascade,
  body               text        not null check (length(body) > 0 and length(body) <= 2000),
  author_id          uuid        not null references profiles(id) on delete cascade,
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint scope_booking_consistency check (
    (scope = 'general' and booking_request_id is null)
    or (scope = 'booking' and booking_request_id is not null)
  )
);

create index if not exists messages_general_idx
  on messages(created_at desc)
  where scope = 'general' and deleted_at is null;

create index if not exists messages_booking_idx
  on messages(booking_request_id, created_at desc)
  where scope = 'booking' and deleted_at is null;

alter table messages enable row level security;

drop policy if exists "messages_read" on messages;
create policy "messages_read"
  on messages for select to authenticated using (true);

drop policy if exists "messages_insert" on messages;
create policy "messages_insert"
  on messages for insert to authenticated with check (
    author_id = auth.uid()
  );

drop policy if exists "messages_update_own" on messages;
create policy "messages_update_own"
  on messages for update to authenticated
  using (author_id = auth.uid() or is_admin())
  with check (author_id = auth.uid() or is_admin());


-- ─── 4. WIKI PAGES ─────────────────────────────────────────────────────────
-- Admin-edited how-to articles ("How to reset the boiler", "Where the
-- stopcock is"). Markdown body. Everyone reads; admin writes.

create table if not exists wiki_pages (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        not null unique check (slug ~ '^[a-z0-9-]+$' and length(slug) > 0 and length(slug) <= 100),
  title       text        not null check (length(title) > 0 and length(title) <= 200),
  body        text        not null default '',
  is_pinned   boolean     not null default false,
  created_by  uuid                references profiles(id) on delete set null,
  updated_by  uuid                references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists wiki_pages_pinned_idx on wiki_pages(is_pinned desc, title);

alter table wiki_pages enable row level security;

drop policy if exists "wiki_pages_read" on wiki_pages;
create policy "wiki_pages_read"
  on wiki_pages for select to authenticated using (true);

drop policy if exists "wiki_pages_admin_write" on wiki_pages;
create policy "wiki_pages_admin_write"
  on wiki_pages for all to authenticated
  using (is_admin()) with check (is_admin());


-- ─── 5. USER FEATURE PREFERENCES ───────────────────────────────────────────
-- Per-user toggles for which optional tabs they want to see. Single row
-- per user; absent row = all defaults.

create table if not exists user_feature_prefs (
  user_id              uuid        primary key references profiles(id) on delete cascade,
  show_expenses        boolean     not null default true,
  show_contacts        boolean     not null default true,
  show_chat            boolean     not null default true,
  show_wiki            boolean     not null default true,
  email_notifications  boolean     not null default false,
  updated_at           timestamptz not null default now()
);

alter table user_feature_prefs enable row level security;

drop policy if exists "user_feature_prefs_self_read" on user_feature_prefs;
create policy "user_feature_prefs_self_read"
  on user_feature_prefs for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_feature_prefs_self_upsert" on user_feature_prefs;
create policy "user_feature_prefs_self_upsert"
  on user_feature_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

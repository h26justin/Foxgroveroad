-- =============================================================================
-- FOXGROVE ROAD — BASE SCHEMA SNAPSHOT
-- =============================================================================
-- Generated from the live Supabase database (public schema + storage
-- policies) on 2026-10-24, BEFORE db/11 and db/12 were applied.
--
-- REFERENCE ONLY. Do not run this against the existing database — it
-- has no IF NOT EXISTS guards. It exists so the full schema, RLS
-- policies, functions and triggers are reviewable in git. The numbered
-- files (02_ onwards) are the incremental changes; to rebuild from
-- scratch, run this file then 11_ and 12_.
--
-- Regenerate after schema changes rather than hand-editing.
-- =============================================================================

create extension if not exists pgcrypto;
-- Functions are listed alphabetically, not in dependency order.
set check_function_bodies = off;

-- ─── ENUMS ─────────────────────────────────────────────────────────────────

create type public.bed_type as enum ('single', 'double', 'king', 'super_king', 'twin', 'sofa_bed', 'cot', 'bunk');
create type public.booking_request_status as enum ('pending', 'approved', 'declined', 'cancelled');
create type public.booking_status as enum ('requested', 'approved', 'declined', 'cancelled', 'checked_out');
create type public.cleaning_status as enum ('clean', 'occupied', 'needs_cleaning', 'in_progress', 'ready');
create type public.task_frequency as enum ('daily', 'weekly', 'monthly', 'turnaround', 'one_off');
create type public.task_status as enum ('pending', 'in_progress', 'done', 'skipped');
create type public.user_role as enum ('admin', 'family', 'cleaner', 'pending');

-- ─── TABLES, CONSTRAINTS, INDEXES ──────────────────────────────────────────

create table public.admin_audit (
  id uuid default gen_random_uuid() not null,
  actor_id uuid,
  action text not null,
  target_kind text,
  target_id uuid,
  payload jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);
alter table public.admin_audit add constraint admin_audit_pkey PRIMARY KEY (id);
CREATE INDEX admin_audit_actor_idx ON public.admin_audit USING btree (actor_id, created_at DESC);
CREATE INDEX admin_audit_created_idx ON public.admin_audit USING btree (created_at DESC);
CREATE INDEX admin_audit_target_idx ON public.admin_audit USING btree (target_kind, target_id);
alter table public.admin_audit enable row level security;

create table public.announcement_dismissals (
  announcement_id uuid not null,
  user_id uuid not null,
  dismissed_at timestamp with time zone default now() not null
);
alter table public.announcement_dismissals add constraint announcement_dismissals_pkey PRIMARY KEY (announcement_id, user_id);
alter table public.announcement_dismissals enable row level security;

create table public.announcements (
  id uuid default gen_random_uuid() not null,
  body text not null,
  created_by uuid not null,
  created_at timestamp with time zone default now() not null,
  is_active boolean default true not null,
  dismissible boolean default true not null
);
alter table public.announcements add constraint announcements_pkey PRIMARY KEY (id);
alter table public.announcements add constraint announcements_body_check CHECK (((length(body) > 0) AND (length(body) <= 500)));
CREATE INDEX announcements_active_idx ON public.announcements USING btree (created_at DESC) WHERE (is_active = true);
alter table public.announcements enable row level security;

create table public.attachments (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  storage_path text not null,
  mime_type text not null,
  size_bytes integer not null,
  kind text not null,
  entity_id uuid not null,
  caption text
);
alter table public.attachments add constraint attachments_pkey PRIMARY KEY (id);
alter table public.attachments add constraint attachments_caption_check CHECK ((char_length(caption) <= 500));
alter table public.attachments add constraint attachments_kind_check CHECK ((kind = ANY (ARRAY['issue'::text, 'prearrival_check'::text, 'booking'::text, 'damage'::text, 'general'::text, 'room'::text])));
alter table public.attachments add constraint attachments_size_bytes_check CHECK (((size_bytes > 0) AND (size_bytes <= ((10 * 1024) * 1024))));
CREATE INDEX idx_attachments_created_at ON public.attachments USING btree (created_at DESC);
CREATE INDEX attachments_kind_entity_idx ON public.attachments USING btree (kind, entity_id);
CREATE INDEX idx_attachments_kind_entity ON public.attachments USING btree (kind, entity_id);
CREATE INDEX idx_attachments_created_by ON public.attachments USING btree (created_by);
alter table public.attachments enable row level security;

create table public.beds (
  id uuid default gen_random_uuid() not null,
  room_id uuid not null,
  name text not null,
  bed_type bed_type not null,
  pos_x numeric default 10 not null,
  pos_y numeric default 10 not null,
  width numeric default 60 not null,
  height numeric default 90 not null,
  created_at timestamp with time zone default now() not null
);
alter table public.beds add constraint beds_pkey PRIMARY KEY (id);
alter table public.beds enable row level security;

create table public.bin_calendar_cache (
  id text default 'singleton'::text not null,
  source_url text,
  events jsonb default '[]'::jsonb not null,
  fetched_at timestamp with time zone default now() not null,
  error text,
  updated_at timestamp with time zone default now() not null
);
alter table public.bin_calendar_cache add constraint bin_calendar_cache_pkey PRIMARY KEY (id);
alter table public.bin_calendar_cache enable row level security;

create table public.booking_request_children (
  id uuid default gen_random_uuid() not null,
  request_id uuid not null,
  age_band text not null,
  sleep_arrangement text not null,
  "position" integer default 0 not null,
  created_at timestamp with time zone default now() not null
);
alter table public.booking_request_children add constraint booking_request_children_pkey PRIMARY KEY (id);
alter table public.booking_request_children add constraint booking_request_children_age_band_check CHECK ((age_band = ANY (ARRAY['infant'::text, 'toddler'::text, 'child'::text])));
alter table public.booking_request_children add constraint booking_request_children_sleep_arrangement_check CHECK ((sleep_arrangement = ANY (ARRAY['cot'::text, 'own_bed'::text, 'sharing_with_parent'::text])));
alter table public.booking_request_children add constraint chk_arrangement_for_age CHECK ((((age_band = 'infant'::text) AND (sleep_arrangement = 'cot'::text)) OR ((age_band = 'toddler'::text) AND (sleep_arrangement = ANY (ARRAY['cot'::text, 'own_bed'::text]))) OR ((age_band = 'child'::text) AND (sleep_arrangement = ANY (ARRAY['own_bed'::text, 'sharing_with_parent'::text])))));
CREATE INDEX idx_brc_request ON public.booking_request_children USING btree (request_id, "position");
alter table public.booking_request_children enable row level security;

create table public.booking_request_guests (
  id uuid default gen_random_uuid() not null,
  request_id uuid not null,
  guest_id uuid not null,
  "position" integer default 0 not null,
  created_at timestamp with time zone default now() not null
);
alter table public.booking_request_guests add constraint booking_request_guests_unique UNIQUE (request_id, guest_id);
alter table public.booking_request_guests add constraint booking_request_guests_pkey PRIMARY KEY (id);
CREATE INDEX idx_brg_request ON public.booking_request_guests USING btree (request_id);
CREATE INDEX idx_brg_guest ON public.booking_request_guests USING btree (guest_id);
alter table public.booking_request_guests enable row level security;

create table public.booking_requests (
  id uuid default gen_random_uuid() not null,
  requested_by uuid not null,
  check_in date not null,
  check_out date not null,
  adults integer default 1 not null,
  children integer default 0 not null,
  notes text,
  status booking_request_status default 'pending'::booking_request_status not null,
  admin_notes text,
  created_at timestamp with time zone default now() not null,
  decided_at timestamp with time zone,
  decided_by uuid,
  adults_sharing boolean default true not null,
  arrival_token text
);
alter table public.booking_requests add constraint booking_requests_pkey PRIMARY KEY (id);
alter table public.booking_requests add constraint booking_requests_adults_check CHECK ((adults >= 1));
alter table public.booking_requests add constraint booking_requests_children_check CHECK ((children >= 0));
alter table public.booking_requests add constraint check_request_dates CHECK ((check_out > check_in));
CREATE UNIQUE INDEX booking_requests_arrival_token_uniq ON public.booking_requests USING btree (arrival_token) WHERE (arrival_token IS NOT NULL);
CREATE INDEX idx_request_user ON public.booking_requests USING btree (requested_by);
CREATE INDEX idx_request_dates ON public.booking_requests USING btree (check_in, check_out);
CREATE INDEX idx_request_status ON public.booking_requests USING btree (status);
alter table public.booking_requests enable row level security;

create table public.bookings (
  id uuid default gen_random_uuid() not null,
  guest_name text not null,
  requested_by uuid,
  bed_id uuid,
  check_in date not null,
  check_out date not null,
  status booking_status default 'requested'::booking_status not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  approved_at timestamp with time zone,
  approved_by uuid,
  request_id uuid,
  guest_id uuid
);
alter table public.bookings add constraint bookings_pkey PRIMARY KEY (id);
alter table public.bookings add constraint check_dates CHECK ((check_out > check_in));
CREATE INDEX idx_bookings_dates ON public.bookings USING btree (check_in, check_out);
CREATE INDEX bookings_status_dates_idx ON public.bookings USING btree (status, check_in, check_out);
CREATE INDEX idx_bookings_guest_id ON public.bookings USING btree (guest_id);
CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);
CREATE INDEX idx_bookings_bed ON public.bookings USING btree (bed_id) WHERE (bed_id IS NOT NULL);
CREATE INDEX bookings_request_id_idx ON public.bookings USING btree (request_id);
CREATE INDEX bookings_requested_by_idx ON public.bookings USING btree (requested_by);
alter table public.bookings enable row level security;

create table public.cleaner_hour_logs (
  id uuid default gen_random_uuid() not null,
  cleaner_id uuid not null,
  date date not null,
  hours numeric(4,2) not null,
  notes text,
  logged_by uuid,
  logged_at timestamp with time zone default now() not null
);
alter table public.cleaner_hour_logs add constraint cleaner_hour_logs_pkey PRIMARY KEY (id);
alter table public.cleaner_hour_logs add constraint cleaner_hour_logs_hours_check CHECK (((hours > (0)::numeric) AND (hours <= (24)::numeric)));
CREATE INDEX cleaner_hour_logs_cleaner_date_idx ON public.cleaner_hour_logs USING btree (cleaner_id, date);
CREATE INDEX cleaner_hour_logs_date_idx ON public.cleaner_hour_logs USING btree (date DESC);
alter table public.cleaner_hour_logs enable row level security;

create table public.cleaner_hours (
  id uuid default gen_random_uuid() not null,
  week_start_date date not null,
  linda_hours numeric(5,2) default 0 not null,
  sam_hours numeric(5,2) default 0 not null,
  linda_hourly_at_submit numeric(6,2) not null,
  sam_hourly_at_submit numeric(6,2) not null,
  linda_bonus_per_sam_hour_at_submit numeric(6,2) not null,
  notes text,
  submitted_at timestamp with time zone default now() not null,
  submitted_by uuid,
  updated_at timestamp with time zone default now() not null
);
alter table public.cleaner_hours add constraint cleaner_hours_unique_week UNIQUE (week_start_date);
alter table public.cleaner_hours add constraint cleaner_hours_pkey PRIMARY KEY (id);
alter table public.cleaner_hours add constraint cleaner_hours_linda_hours_check CHECK (((linda_hours >= (0)::numeric) AND (linda_hours <= (168)::numeric)));
alter table public.cleaner_hours add constraint cleaner_hours_must_be_monday CHECK ((EXTRACT(isodow FROM week_start_date) = (1)::numeric));
alter table public.cleaner_hours add constraint cleaner_hours_notes_check CHECK ((char_length(notes) <= 1000));
alter table public.cleaner_hours add constraint cleaner_hours_sam_hours_check CHECK (((sam_hours >= (0)::numeric) AND (sam_hours <= (168)::numeric)));
CREATE INDEX idx_cleaner_hours_week ON public.cleaner_hours USING btree (week_start_date DESC);
alter table public.cleaner_hours enable row level security;

create table public.cleaner_pay_rates (
  id text default 'singleton'::text not null,
  linda_hourly numeric(6,2) default 15.00 not null,
  sam_hourly numeric(6,2) default 15.00 not null,
  linda_bonus_per_sam_hour numeric(6,2) default 2.00 not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);
alter table public.cleaner_pay_rates add constraint cleaner_pay_rates_pkey PRIMARY KEY (id);
alter table public.cleaner_pay_rates add constraint cleaner_pay_rates_id_check CHECK ((id = 'singleton'::text));
alter table public.cleaner_pay_rates enable row level security;

create table public.cleaner_shifts (
  id uuid default gen_random_uuid() not null,
  cleaner_id uuid not null,
  shift_date date not null,
  start_time time without time zone,
  end_time time without time zone,
  notes text,
  created_at timestamp with time zone default now() not null
);
alter table public.cleaner_shifts add constraint cleaner_shifts_cleaner_id_shift_date_key UNIQUE (cleaner_id, shift_date);
alter table public.cleaner_shifts add constraint cleaner_shifts_pkey PRIMARY KEY (id);
CREATE INDEX idx_shifts_date ON public.cleaner_shifts USING btree (shift_date);
alter table public.cleaner_shifts enable row level security;

create table public.cleaners (
  id uuid default gen_random_uuid() not null,
  name text not null,
  is_active boolean default true not null,
  profile_id uuid,
  created_at timestamp with time zone default now() not null
);
alter table public.cleaners add constraint cleaners_name_key UNIQUE (name);
alter table public.cleaners add constraint cleaners_pkey PRIMARY KEY (id);
alter table public.cleaners enable row level security;

create table public.contacts (
  id uuid default gen_random_uuid() not null,
  name text not null,
  kind text not null,
  phone text,
  email text,
  notes text,
  is_pinned boolean default false not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.contacts add constraint contacts_pkey PRIMARY KEY (id);
alter table public.contacts add constraint contacts_kind_check CHECK ((kind = ANY (ARRAY['plumber'::text, 'electrician'::text, 'locksmith'::text, 'neighbour'::text, 'gp'::text, 'cleaner'::text, 'gardener'::text, 'handyman'::text, 'other'::text])));
alter table public.contacts add constraint contacts_name_check CHECK (((length(name) > 0) AND (length(name) <= 200)));
CREATE INDEX contacts_pinned_kind_idx ON public.contacts USING btree (is_pinned DESC, kind, name);
alter table public.contacts enable row level security;

create table public.expenses (
  id uuid default gen_random_uuid() not null,
  date date not null,
  amount_pence bigint not null,
  currency text default 'GBP'::text not null,
  category text not null,
  description text not null,
  paid_by uuid,
  booking_request_id uuid,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);
alter table public.expenses add constraint expenses_pkey PRIMARY KEY (id);
alter table public.expenses add constraint expenses_amount_pence_check CHECK ((amount_pence >= 0));
alter table public.expenses add constraint expenses_category_check CHECK ((category = ANY (ARRAY['utilities'::text, 'repairs'::text, 'supplies'::text, 'council_tax'::text, 'insurance'::text, 'cleaning_supply'::text, 'other'::text])));
alter table public.expenses add constraint expenses_currency_check CHECK ((length(currency) = 3));
alter table public.expenses add constraint expenses_description_check CHECK (((length(description) > 0) AND (length(description) <= 500)));
CREATE INDEX expenses_date_idx ON public.expenses USING btree (date DESC);
CREATE INDEX expenses_booking_idx ON public.expenses USING btree (booking_request_id) WHERE (booking_request_id IS NOT NULL);
CREATE INDEX expenses_category_idx ON public.expenses USING btree (category, date DESC);
alter table public.expenses enable row level security;

create table public.feature_flags (
  name text not null,
  enabled boolean default true not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);
alter table public.feature_flags add constraint feature_flags_pkey PRIMARY KEY (name);
alter table public.feature_flags enable row level security;

create table public.guests (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  full_name text not null,
  linked_profile_id uuid,
  dietary_notes text,
  allergies text,
  room_preference text,
  things_they_bring text,
  general_notes text,
  updated_at timestamp with time zone default now() not null
);
alter table public.guests add constraint guests_linked_profile_id_key UNIQUE (linked_profile_id);
alter table public.guests add constraint guests_pkey PRIMARY KEY (id);
alter table public.guests add constraint guests_allergies_check CHECK ((char_length(allergies) <= 500));
alter table public.guests add constraint guests_dietary_notes_check CHECK ((char_length(dietary_notes) <= 500));
alter table public.guests add constraint guests_full_name_check CHECK (((char_length(full_name) >= 1) AND (char_length(full_name) <= 200)));
alter table public.guests add constraint guests_general_notes_check CHECK ((char_length(general_notes) <= 1000));
alter table public.guests add constraint guests_room_preference_check CHECK ((char_length(room_preference) <= 500));
alter table public.guests add constraint guests_things_they_bring_check CHECK ((char_length(things_they_bring) <= 500));
CREATE INDEX idx_guests_full_name ON public.guests USING btree (full_name);
CREATE INDEX idx_guests_linked_profile ON public.guests USING btree (linked_profile_id);
alter table public.guests enable row level security;

create table public.house_settings (
  key text not null,
  value text default ''::text not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);
alter table public.house_settings add constraint house_settings_pkey PRIMARY KEY (key);
alter table public.house_settings enable row level security;

create table public.issues (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  room_id uuid,
  description text not null,
  status text default 'open'::text not null,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  resolution_note text
);
alter table public.issues add constraint issues_pkey PRIMARY KEY (id);
alter table public.issues add constraint issues_description_check CHECK (((char_length(description) >= 1) AND (char_length(description) <= 2000)));
alter table public.issues add constraint issues_resolution_note_check CHECK ((char_length(resolution_note) <= 2000));
alter table public.issues add constraint issues_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])));
CREATE INDEX idx_issues_created_by ON public.issues USING btree (created_by);
CREATE INDEX idx_issues_created_at ON public.issues USING btree (created_at DESC);
CREATE INDEX idx_issues_room ON public.issues USING btree (room_id);
CREATE INDEX idx_issues_status ON public.issues USING btree (status);
alter table public.issues enable row level security;

create table public.linen_items (
  id uuid default gen_random_uuid() not null,
  name text not null,
  total_owned integer default 0 not null,
  in_use integer default 0 not null,
  in_laundry integer default 0 not null,
  clean_in_storage integer default 0 not null,
  low_stock_threshold integer default 2 not null,
  notes text
);
alter table public.linen_items add constraint linen_items_pkey PRIMARY KEY (id);
alter table public.linen_items add constraint check_linen_totals CHECK ((((in_use + in_laundry) + clean_in_storage) <= total_owned));
alter table public.linen_items enable row level security;

create table public.linen_movements (
  id uuid default gen_random_uuid() not null,
  item_id uuid not null,
  change integer not null,
  from_state text,
  to_state text,
  reason text,
  task_id uuid,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);
alter table public.linen_movements add constraint linen_movements_pkey PRIMARY KEY (id);
alter table public.linen_movements enable row level security;

create table public.messages (
  id uuid default gen_random_uuid() not null,
  scope text not null,
  booking_request_id uuid,
  body text not null,
  author_id uuid not null,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);
alter table public.messages add constraint messages_pkey PRIMARY KEY (id);
alter table public.messages add constraint messages_body_check CHECK (((length(body) > 0) AND (length(body) <= 2000)));
alter table public.messages add constraint messages_scope_check CHECK ((scope = ANY (ARRAY['general'::text, 'booking'::text])));
alter table public.messages add constraint scope_booking_consistency CHECK ((((scope = 'general'::text) AND (booking_request_id IS NULL)) OR ((scope = 'booking'::text) AND (booking_request_id IS NOT NULL))));
CREATE INDEX messages_general_idx ON public.messages USING btree (created_at DESC) WHERE ((scope = 'general'::text) AND (deleted_at IS NULL));
CREATE INDEX messages_booking_idx ON public.messages USING btree (booking_request_id, created_at DESC) WHERE ((scope = 'booking'::text) AND (deleted_at IS NULL));
alter table public.messages enable row level security;

create table public.oneshot_tasks (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid not null,
  description text not null,
  room_id uuid,
  priority text default 'normal'::text not null,
  status text default 'pending'::text not null,
  completed_at timestamp with time zone,
  completed_by uuid
);
alter table public.oneshot_tasks add constraint oneshot_tasks_pkey PRIMARY KEY (id);
alter table public.oneshot_tasks add constraint oneshot_tasks_description_check CHECK (((char_length(description) >= 1) AND (char_length(description) <= 2000)));
alter table public.oneshot_tasks add constraint oneshot_tasks_priority_check CHECK ((priority = ANY (ARRAY['normal'::text, 'urgent'::text])));
alter table public.oneshot_tasks add constraint oneshot_tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'archived'::text])));
CREATE INDEX idx_oneshot_room ON public.oneshot_tasks USING btree (room_id);
CREATE INDEX idx_oneshot_created_at ON public.oneshot_tasks USING btree (created_at DESC);
CREATE INDEX idx_oneshot_status ON public.oneshot_tasks USING btree (status);
alter table public.oneshot_tasks enable row level security;

create table public.plant_waterings (
  id uuid default gen_random_uuid() not null,
  plant_id uuid not null,
  watered_by uuid,
  watered_at timestamp with time zone default now() not null,
  watered_at_date date default CURRENT_DATE not null
);
alter table public.plant_waterings add constraint plant_waterings_pkey PRIMARY KEY (id);
CREATE INDEX plant_waterings_date_idx ON public.plant_waterings USING btree (watered_at_date DESC);
CREATE INDEX plant_waterings_plant_id_idx ON public.plant_waterings USING btree (plant_id);
alter table public.plant_waterings enable row level security;

create table public.plants (
  id uuid default gen_random_uuid() not null,
  name text not null,
  location text,
  frequency_days integer default 7 not null,
  notes text,
  "position" integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.plants add constraint plants_pkey PRIMARY KEY (id);
alter table public.plants add constraint plants_frequency_days_check CHECK (((frequency_days > 0) AND (frequency_days <= 365)));
alter table public.plants enable row level security;

create table public.prearrival_checks (
  id uuid default gen_random_uuid() not null,
  booking_request_id uuid not null,
  template_id uuid not null,
  room_id uuid,
  checked_at timestamp with time zone default now() not null,
  checked_by uuid
);
alter table public.prearrival_checks add constraint prearrival_checks_booking_request_id_template_id_key UNIQUE (booking_request_id, template_id);
alter table public.prearrival_checks add constraint prearrival_checks_pkey PRIMARY KEY (id);
CREATE INDEX idx_prearrival_checks_booking ON public.prearrival_checks USING btree (booking_request_id);
alter table public.prearrival_checks enable row level security;

create table public.prearrival_templates (
  id uuid default gen_random_uuid() not null,
  room_id uuid not null,
  name text not null,
  "position" integer default 0 not null,
  created_at timestamp with time zone default now() not null
);
alter table public.prearrival_templates add constraint prearrival_templates_room_id_name_key UNIQUE (room_id, name);
alter table public.prearrival_templates add constraint prearrival_templates_pkey PRIMARY KEY (id);
CREATE INDEX idx_prearrival_templates_room ON public.prearrival_templates USING btree (room_id, "position");
alter table public.prearrival_templates enable row level security;

create table public.profiles (
  id uuid not null,
  full_name text not null,
  role user_role default 'family'::user_role not null,
  phone text,
  push_subscription jsonb,
  created_at timestamp with time zone default now() not null,
  accessibility_mode text default 'normal'::text not null,
  is_deleted boolean default false not null,
  calendar_token text
);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_accessibility_mode_check CHECK ((accessibility_mode = ANY (ARRAY['normal'::text, 'large'::text])));
CREATE INDEX profiles_active_idx ON public.profiles USING btree (created_at) WHERE (is_deleted = false);
CREATE UNIQUE INDEX profiles_calendar_token_uniq ON public.profiles USING btree (calendar_token) WHERE (calendar_token IS NOT NULL);
alter table public.profiles enable row level security;

create table public.push_subscriptions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamp with time zone default now() not null
);
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_key UNIQUE (endpoint);
alter table public.push_subscriptions add constraint push_subscriptions_pkey PRIMARY KEY (id);
CREATE INDEX idx_push_user ON public.push_subscriptions USING btree (user_id);
alter table public.push_subscriptions enable row level security;

create table public.room_linen (
  id uuid default gen_random_uuid() not null,
  room_id uuid not null,
  item_type text not null,
  size text,
  expected_count integer default 0 not null,
  clean_count integer default 0 not null,
  dirty_count integer default 0 not null,
  washing_count integer default 0 not null,
  notes text,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);
alter table public.room_linen add constraint room_linen_pkey PRIMARY KEY (id);
alter table public.room_linen add constraint room_linen_clean_count_check CHECK ((clean_count >= 0));
alter table public.room_linen add constraint room_linen_dirty_count_check CHECK ((dirty_count >= 0));
alter table public.room_linen add constraint room_linen_expected_count_check CHECK ((expected_count >= 0));
alter table public.room_linen add constraint room_linen_washing_count_check CHECK ((washing_count >= 0));
CREATE UNIQUE INDEX room_linen_uniq_with_size ON public.room_linen USING btree (room_id, item_type, size) WHERE (size IS NOT NULL);
CREATE INDEX idx_room_linen_room ON public.room_linen USING btree (room_id);
CREATE UNIQUE INDEX room_linen_uniq_no_size ON public.room_linen USING btree (room_id, item_type) WHERE (size IS NULL);
alter table public.room_linen enable row level security;

create table public.rooms (
  id uuid default gen_random_uuid() not null,
  name text not null,
  description text,
  floor smallint default 0,
  pos_x numeric default 0 not null,
  pos_y numeric default 0 not null,
  width numeric default 200 not null,
  height numeric default 150 not null,
  cleaning_status cleaning_status default 'clean'::cleaning_status not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  is_owner_room boolean default false not null,
  room_type text default 'bedroom'::text not null,
  can_fit_cot boolean default true not null,
  linked_bedroom_id uuid,
  manual_turnover_at timestamp with time zone
);
alter table public.rooms add constraint rooms_name_unique UNIQUE (name);
alter table public.rooms add constraint rooms_pkey PRIMARY KEY (id);
CREATE INDEX idx_rooms_linked_bedroom ON public.rooms USING btree (linked_bedroom_id) WHERE (linked_bedroom_id IS NOT NULL);
alter table public.rooms enable row level security;

create table public.task_completions (
  id uuid default gen_random_uuid() not null,
  task_template_id uuid not null,
  completed_at timestamp with time zone default now() not null,
  completed_at_date date default CURRENT_DATE not null,
  completed_by uuid,
  notes text
);
alter table public.task_completions add constraint task_completions_pkey PRIMARY KEY (id);
CREATE INDEX idx_task_completions_completed_at ON public.task_completions USING btree (completed_at DESC);
CREATE INDEX idx_task_completions_template_completed ON public.task_completions USING btree (task_template_id, completed_at_date DESC);
alter table public.task_completions enable row level security;

create table public.task_templates (
  id uuid default gen_random_uuid() not null,
  name text not null,
  room_id uuid,
  frequency task_frequency,
  default_checklist jsonb default '[]'::jsonb not null,
  estimated_minutes integer default 15,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  frequency_days integer,
  notes text,
  is_turnaround boolean default false not null,
  task_kind text default 'recurring'::text not null
);
alter table public.task_templates add constraint task_templates_pkey PRIMARY KEY (id);
alter table public.task_templates add constraint chk_task_kind CHECK ((task_kind = ANY (ARRAY['turnover'::text, 'recurring'::text, 'occupied_only'::text])));
alter table public.task_templates enable row level security;

create table public.tasks (
  id uuid default gen_random_uuid() not null,
  template_id uuid,
  title text not null,
  room_id uuid,
  assigned_to uuid,
  related_booking_id uuid,
  due_date date not null,
  due_time time without time zone,
  status task_status default 'pending'::task_status not null,
  checklist jsonb default '[]'::jsonb not null,
  cleaner_notes text,
  photo_urls text[],
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);
alter table public.tasks add constraint tasks_pkey PRIMARY KEY (id);
CREATE INDEX idx_tasks_due ON public.tasks USING btree (due_date, status);
CREATE INDEX idx_tasks_assigned ON public.tasks USING btree (assigned_to, due_date);
alter table public.tasks enable row level security;

create table public.user_feature_prefs (
  user_id uuid not null,
  show_expenses boolean default true not null,
  show_contacts boolean default true not null,
  show_chat boolean default true not null,
  show_wiki boolean default true not null,
  email_notifications boolean default false not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.user_feature_prefs add constraint user_feature_prefs_pkey PRIMARY KEY (user_id);
alter table public.user_feature_prefs enable row level security;

create table public.user_room_order (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  room_id uuid not null,
  "position" integer not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.user_room_order add constraint user_room_order_user_id_room_id_key UNIQUE (user_id, room_id);
alter table public.user_room_order add constraint user_room_order_pkey PRIMARY KEY (id);
CREATE INDEX idx_user_room_order_user ON public.user_room_order USING btree (user_id, "position");
alter table public.user_room_order enable row level security;

create table public.wiki_pages (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  title text not null,
  body text default ''::text not null,
  is_pinned boolean default false not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.wiki_pages add constraint wiki_pages_slug_key UNIQUE (slug);
alter table public.wiki_pages add constraint wiki_pages_pkey PRIMARY KEY (id);
alter table public.wiki_pages add constraint wiki_pages_slug_check CHECK (((slug ~ '^[a-z0-9-]+$'::text) AND (length(slug) > 0) AND (length(slug) <= 100)));
alter table public.wiki_pages add constraint wiki_pages_title_check CHECK (((length(title) > 0) AND (length(title) <= 200)));
CREATE INDEX wiki_pages_pinned_idx ON public.wiki_pages USING btree (is_pinned DESC, title);
alter table public.wiki_pages enable row level security;

-- ─── FOREIGN KEYS ──────────────────────────────────────────────────────────

alter table public.admin_audit add constraint admin_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.announcement_dismissals add constraint announcement_dismissals_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE;
alter table public.announcement_dismissals add constraint announcement_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.announcements add constraint announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.attachments add constraint attachments_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.beds add constraint beds_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;
alter table public.booking_request_children add constraint booking_request_children_request_id_fkey FOREIGN KEY (request_id) REFERENCES booking_requests(id) ON DELETE CASCADE;
alter table public.booking_request_guests add constraint booking_request_guests_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE;
alter table public.booking_request_guests add constraint booking_request_guests_request_id_fkey FOREIGN KEY (request_id) REFERENCES booking_requests(id) ON DELETE CASCADE;
alter table public.booking_requests add constraint booking_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES profiles(id);
alter table public.booking_requests add constraint booking_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.bookings add constraint bookings_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES profiles(id);
alter table public.bookings add constraint bookings_bed_id_fkey FOREIGN KEY (bed_id) REFERENCES beds(id) ON DELETE SET NULL;
alter table public.bookings add constraint bookings_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL;
alter table public.bookings add constraint bookings_request_id_fkey FOREIGN KEY (request_id) REFERENCES booking_requests(id) ON DELETE SET NULL;
alter table public.bookings add constraint bookings_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.cleaner_hour_logs add constraint cleaner_hour_logs_cleaner_id_fkey FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE;
alter table public.cleaner_hour_logs add constraint cleaner_hour_logs_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.cleaner_hours add constraint cleaner_hours_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.cleaner_pay_rates add constraint cleaner_pay_rates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.cleaner_shifts add constraint cleaner_shifts_cleaner_id_fkey FOREIGN KEY (cleaner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.cleaners add constraint cleaners_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id);
alter table public.contacts add constraint contacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.expenses add constraint expenses_booking_request_id_fkey FOREIGN KEY (booking_request_id) REFERENCES booking_requests(id) ON DELETE SET NULL;
alter table public.expenses add constraint expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.expenses add constraint expenses_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.feature_flags add constraint feature_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.guests add constraint guests_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.guests add constraint guests_linked_profile_id_fkey FOREIGN KEY (linked_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.house_settings add constraint house_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.issues add constraint issues_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.issues add constraint issues_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.issues add constraint issues_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL;
alter table public.linen_movements add constraint linen_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.linen_movements add constraint linen_movements_item_id_fkey FOREIGN KEY (item_id) REFERENCES linen_items(id) ON DELETE CASCADE;
alter table public.linen_movements add constraint linen_movements_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
alter table public.messages add constraint messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.messages add constraint messages_booking_request_id_fkey FOREIGN KEY (booking_request_id) REFERENCES booking_requests(id) ON DELETE CASCADE;
alter table public.oneshot_tasks add constraint oneshot_tasks_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.oneshot_tasks add constraint oneshot_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table public.oneshot_tasks add constraint oneshot_tasks_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL;
alter table public.plant_waterings add constraint plant_waterings_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE;
alter table public.plant_waterings add constraint plant_waterings_watered_by_fkey FOREIGN KEY (watered_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.prearrival_checks add constraint prearrival_checks_booking_request_id_fkey FOREIGN KEY (booking_request_id) REFERENCES booking_requests(id) ON DELETE CASCADE;
alter table public.prearrival_checks add constraint prearrival_checks_checked_by_fkey FOREIGN KEY (checked_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.prearrival_checks add constraint prearrival_checks_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;
alter table public.prearrival_checks add constraint prearrival_checks_template_id_fkey FOREIGN KEY (template_id) REFERENCES prearrival_templates(id) ON DELETE CASCADE;
alter table public.prearrival_templates add constraint prearrival_templates_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.push_subscriptions add constraint push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.room_linen add constraint room_linen_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;
alter table public.room_linen add constraint room_linen_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.rooms add constraint rooms_linked_bedroom_id_fkey FOREIGN KEY (linked_bedroom_id) REFERENCES rooms(id) ON DELETE SET NULL;
alter table public.task_completions add constraint task_completions_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.task_completions add constraint task_completions_task_template_id_fkey FOREIGN KEY (task_template_id) REFERENCES task_templates(id) ON DELETE CASCADE;
alter table public.task_templates add constraint task_templates_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;
alter table public.tasks add constraint tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.tasks add constraint tasks_related_booking_id_fkey FOREIGN KEY (related_booking_id) REFERENCES bookings(id) ON DELETE SET NULL;
alter table public.tasks add constraint tasks_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL;
alter table public.tasks add constraint tasks_template_id_fkey FOREIGN KEY (template_id) REFERENCES task_templates(id) ON DELETE SET NULL;
alter table public.user_feature_prefs add constraint user_feature_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.user_room_order add constraint user_room_order_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;
alter table public.user_room_order add constraint user_room_order_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.wiki_pages add constraint wiki_pages_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.wiki_pages add constraint wiki_pages_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ─── FUNCTIONS ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_turnaround_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_room_id uuid;
  v_template task_templates%rowtype;
  v_checklist jsonb;
begin
  if new.status <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then return new; end if;

  new.approved_at := now();
  new.approved_by := auth.uid();

  select room_id into v_room_id from beds where id = new.bed_id;
  if v_room_id is null then return new; end if;

  select * into v_template
    from task_templates
   where frequency = 'turnaround'
     and active = true
     and (room_id = v_room_id or room_id is null)
   order by (room_id = v_room_id) desc
   limit 1;

  if v_template.id is null then
    v_checklist := '[
      {"item": "Strip beds and bag linen", "done": false},
      {"item": "Remake beds with fresh linen", "done": false},
      {"item": "Replace towels", "done": false},
      {"item": "Hoover and mop floors", "done": false},
      {"item": "Clean bathroom", "done": false},
      {"item": "Restock toiletries", "done": false},
      {"item": "Empty bins", "done": false},
      {"item": "Final check", "done": false}
    ]'::jsonb;
  else
    v_checklist := v_template.default_checklist;
  end if;

  insert into tasks (template_id, title, room_id, related_booking_id,
                     due_date, checklist, status)
  values (
    v_template.id,
    'Turnaround: ' || new.guest_name,
    v_room_id,
    new.id,
    new.check_out,
    v_checklist,
    'pending'
  );

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.fg_check_bed_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  conflict_count int;
begin
  if new.status is distinct from 'approved' then
    return new;
  end if;

  select count(*)
  into conflict_count
  from bookings b
  where b.bed_id = new.bed_id
    and b.status = 'approved'
    and b.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and (
      b.request_id is null
      or new.request_id is null
      or b.request_id <> new.request_id
    )
    and b.check_in < new.check_out
    and b.check_out > new.check_in;

  if conflict_count > 0 then
    raise exception 'Bed % already has an approved booking overlapping these dates',
      new.bed_id;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.fg_cleaner_hours_touch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.fg_guests_touch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.fg_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$function$
;
CREATE OR REPLACE FUNCTION public.fg_is_cleaner()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (select 1 from profiles where id = auth.uid() and role = 'cleaner');
$function$
;
CREATE OR REPLACE FUNCTION public.fg_room_state(p_room_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  with target as (
    select
      r.id                  as original_id,
      case when r.room_type = 'bathroom' and r.linked_bedroom_id is not null
           then r.linked_bedroom_id else r.id end as room_id_for_state,
      r.room_type, r.is_owner_room, r.linked_bedroom_id,
      r.manual_turnover_at  as own_manual_turnover,
      ((r.room_type = 'bedroom' and r.is_owner_room = false)
       or (r.room_type = 'bathroom' and r.linked_bedroom_id is not null)) as tracks_occupancy
    from rooms r where r.id = p_room_id
  ),
  linked_manual as (
    select r2.manual_turnover_at as linked_manual_turnover
    from target t
    left join rooms r2 on r2.id = t.room_id_for_state and t.room_type = 'bathroom'
    limit 1
  ),
  current_booking as (
    select 1 from bookings b
    join beds bd on bd.id = b.bed_id
    join target t on bd.room_id = t.room_id_for_state
    where b.status = 'approved'
      and b.check_in <= current_date and b.check_out > current_date
    limit 1
  ),
  effective_checkout as (
    select greatest(
      coalesce(
        (select max(b.check_out)::timestamptz
           from bookings b
           join beds bd on bd.id = b.bed_id
           join target t on bd.room_id = t.room_id_for_state
           where b.status = 'approved' and b.check_out <= current_date),
        '1970-01-01'::timestamptz
      ),
      coalesce((select own_manual_turnover from target),       '1970-01-01'::timestamptz),
      coalesce((select linked_manual_turnover from linked_manual), '1970-01-01'::timestamptz)
    ) as last_checkout_at
  ),
  pending_turnover as (
    select 1 from task_templates tt
    join target t on tt.room_id = t.original_id
    cross join effective_checkout ec
    where tt.task_kind = 'turnover'
      and ec.last_checkout_at > '1970-01-01'::timestamptz
      and not exists (
        select 1 from task_completions tc
        where tc.task_template_id = tt.id
          and tc.completed_at >= ec.last_checkout_at
      )
    limit 1
  )
  select case
    when (select tracks_occupancy from target) = false then 'idle'
    when exists (select 1 from current_booking)        then 'occupied'
    when exists (select 1 from pending_turnover)       then 'just_vacated'
    else 'idle'
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'family'
  );
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_task_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.status = 'in_progress' and (old.status is distinct from 'in_progress') then
    new.started_at := coalesce(new.started_at, now());
    if new.room_id is not null then
      update rooms set cleaning_status = 'in_progress' where id = new.room_id;
    end if;
  end if;

  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
    if new.room_id is not null then
      update rooms set cleaning_status = 'ready' where id = new.room_id;
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$function$
;
CREATE OR REPLACE FUNCTION public.is_cleaner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from profiles where id = auth.uid() and role = 'cleaner');
$function$
;
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.run_daily_rollover()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update rooms r
     set cleaning_status = 'needs_cleaning'
   where r.id in (
     select bd.room_id
       from bookings b
       join beds bd on bd.id = b.bed_id
      where b.status = 'approved'
        and b.check_out = current_date
   );

  update rooms r
     set cleaning_status = 'occupied'
   where r.id in (
     select bd.room_id
       from bookings b
       join beds bd on bd.id = b.bed_id
      where b.status = 'approved'
        and b.check_in <= current_date
        and b.check_out > current_date
   );

  update bookings
     set status = 'checked_out'
   where status = 'approved'
     and check_out < current_date;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_arrival_token_if_approved()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.status = 'approved' and new.arrival_token is null then
    new.arrival_token := encode(gen_random_bytes(24), 'hex');
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_calendar_token()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.calendar_token is null then
    new.calendar_token := encode(gen_random_bytes(32), 'hex');
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.trg_plants_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

-- ─── VIEWS ─────────────────────────────────────────────────────────────────

create view public.cleaner_tasks_today as
 WITH last_done AS (
         SELECT task_completions.task_template_id,
            max(task_completions.completed_at_date) AS last_completed_date,
            max(task_completions.completed_at) AS last_completed_at
           FROM task_completions
          GROUP BY task_completions.task_template_id
        ), effective_checkout_per_room AS (
         SELECT r_1.id AS room_id,
            GREATEST(COALESCE(( SELECT (max(b.check_out))::timestamp with time zone AS max
                   FROM (bookings b
                     JOIN beds bd ON ((bd.id = b.bed_id)))
                  WHERE ((bd.room_id =
                        CASE
                            WHEN ((r_1.room_type = 'bathroom'::text) AND (r_1.linked_bedroom_id IS NOT NULL)) THEN r_1.linked_bedroom_id
                            ELSE r_1.id
                        END) AND (b.status = 'approved'::booking_status) AND (b.check_out <= CURRENT_DATE))), '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(r_1.manual_turnover_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(( SELECT r2.manual_turnover_at
                   FROM rooms r2
                  WHERE ((r_1.room_type = 'bathroom'::text) AND (r_1.linked_bedroom_id IS NOT NULL) AND (r2.id = r_1.linked_bedroom_id))), '1970-01-01 00:00:00+00'::timestamp with time zone)) AS last_checkout_at
           FROM rooms r_1
        )
 SELECT tt.id,
    tt.name,
    tt.notes,
    tt.frequency_days,
    tt.is_turnaround,
    tt.task_kind,
    tt.room_id,
    r.name AS room_name,
    r.floor,
    r.room_type,
    ld.last_completed_date,
    ld.last_completed_at,
    fg_room_state(r.id) AS room_state,
        CASE
            WHEN (tt.task_kind = 'turnover'::text) THEN NULL::date
            WHEN (tt.frequency_days IS NULL) THEN NULL::date
            WHEN (ld.last_completed_date IS NULL) THEN NULL::date
            ELSE (ld.last_completed_date + tt.frequency_days)
        END AS next_due_date,
        CASE
            WHEN (tt.task_kind = 'turnover'::text) THEN
            CASE
                WHEN (ec.last_checkout_at <= '1970-01-01 00:00:00+00'::timestamp with time zone) THEN 'no_schedule'::text
                WHEN ((ld.last_completed_at IS NULL) OR (ld.last_completed_at < ec.last_checkout_at)) THEN 'overdue'::text
                ELSE 'scheduled'::text
            END
            WHEN (tt.task_kind = 'occupied_only'::text) THEN
            CASE
                WHEN (fg_room_state(r.id) <> 'occupied'::text) THEN 'scheduled'::text
                WHEN (tt.frequency_days IS NULL) THEN 'no_schedule'::text
                WHEN (ld.last_completed_date IS NULL) THEN 'overdue'::text
                WHEN ((ld.last_completed_date + tt.frequency_days) <= CURRENT_DATE) THEN
                CASE
                    WHEN ((ld.last_completed_date + tt.frequency_days) = CURRENT_DATE) THEN 'due'::text
                    ELSE 'overdue'::text
                END
                ELSE 'scheduled'::text
            END
            ELSE
            CASE
                WHEN (tt.frequency_days IS NULL) THEN 'no_schedule'::text
                WHEN (ld.last_completed_date IS NULL) THEN 'overdue'::text
                WHEN ((ld.last_completed_date + tt.frequency_days) <= CURRENT_DATE) THEN
                CASE
                    WHEN ((ld.last_completed_date + tt.frequency_days) = CURRENT_DATE) THEN 'due'::text
                    ELSE 'overdue'::text
                END
                ELSE 'scheduled'::text
            END
        END AS status,
        CASE
            WHEN (tt.task_kind = 'turnover'::text) THEN
            CASE
                WHEN (ec.last_checkout_at <= '1970-01-01 00:00:00+00'::timestamp with time zone) THEN NULL::integer
                WHEN ((ld.last_completed_at IS NULL) OR (ld.last_completed_at < ec.last_checkout_at)) THEN (CURRENT_DATE - (ec.last_checkout_at)::date)
                ELSE NULL::integer
            END
            WHEN ((tt.task_kind = 'occupied_only'::text) AND (fg_room_state(r.id) <> 'occupied'::text)) THEN NULL::integer
            WHEN (tt.frequency_days IS NULL) THEN NULL::integer
            WHEN (ld.last_completed_date IS NULL) THEN 999
            ELSE (CURRENT_DATE - (ld.last_completed_date + tt.frequency_days))
        END AS days_overdue
   FROM (((task_templates tt
     JOIN rooms r ON ((r.id = tt.room_id)))
     LEFT JOIN last_done ld ON ((ld.task_template_id = tt.id)))
     LEFT JOIN effective_checkout_per_room ec ON ((ec.room_id = r.id)));

-- ─── TRIGGERS ──────────────────────────────────────────────────────────────

CREATE TRIGGER booking_requests_set_arrival_token_ins BEFORE INSERT ON public.booking_requests FOR EACH ROW EXECUTE FUNCTION set_arrival_token_if_approved();
CREATE TRIGGER booking_requests_set_arrival_token_upd BEFORE UPDATE ON public.booking_requests FOR EACH ROW EXECUTE FUNCTION set_arrival_token_if_approved();
CREATE TRIGGER trg_check_bed_overlap BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION fg_check_bed_overlap();
CREATE TRIGGER trg_cleaner_hours_touch BEFORE UPDATE ON public.cleaner_hours FOR EACH ROW EXECUTE FUNCTION fg_cleaner_hours_touch();
CREATE TRIGGER trg_guests_touch BEFORE UPDATE ON public.guests FOR EACH ROW EXECUTE FUNCTION fg_guests_touch();
CREATE TRIGGER plants_set_updated_at BEFORE UPDATE ON public.plants FOR EACH ROW EXECUTE FUNCTION trg_plants_set_updated_at();
CREATE TRIGGER profiles_set_calendar_token BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_calendar_token();
CREATE TRIGGER tasks_status_change BEFORE UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION handle_task_status_change();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── RLS POLICIES ──────────────────────────────────────────────────────────

create policy admin_audit_admin_insert on public.admin_audit as PERMISSIVE for INSERT to authenticated
  with check (is_admin());
create policy admin_audit_admin_read on public.admin_audit as PERMISSIVE for SELECT to authenticated
  using (is_admin());
create policy dismissals_delete on public.announcement_dismissals as PERMISSIVE for DELETE to authenticated
  using ((user_id = auth.uid()));
create policy dismissals_insert on public.announcement_dismissals as PERMISSIVE for INSERT to authenticated
  with check ((user_id = auth.uid()));
create policy dismissals_read on public.announcement_dismissals as PERMISSIVE for SELECT to authenticated
  using ((user_id = auth.uid()));
create policy announcements_admin_write on public.announcements as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());
create policy announcements_read on public.announcements as PERMISSIVE for SELECT to authenticated
  using (true);
create policy attachments_delete on public.attachments as PERMISSIVE for DELETE to public
  using ((fg_is_admin() OR (created_by = auth.uid())));
create policy attachments_insert on public.attachments as PERMISSIVE for INSERT to public
  with check (((created_by = auth.uid()) AND (fg_is_admin() OR (fg_is_cleaner() AND (kind = ANY (ARRAY['issue'::text, 'prearrival_check'::text, 'room'::text, 'damage'::text, 'general'::text]))) OR ((kind = 'booking'::text) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = attachments.entity_id) AND (b.requested_by = auth.uid()))))))));
create policy attachments_select on public.attachments as PERMISSIVE for SELECT to public
  using ((fg_is_admin() OR (fg_is_cleaner() AND ((created_by = auth.uid()) OR (kind = ANY (ARRAY['issue'::text, 'prearrival_check'::text, 'room'::text, 'oneshot_task'::text])))) OR ((kind = 'booking'::text) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = attachments.entity_id) AND (b.requested_by = auth.uid())))))));
create policy attachments_update on public.attachments as PERMISSIVE for UPDATE to public
  using ((fg_is_admin() OR (created_by = auth.uid())))
  with check ((fg_is_admin() OR (created_by = auth.uid())));
create policy beds_admin on public.beds as PERMISSIVE for ALL to public
  using (is_admin())
  with check (is_admin());
create policy beds_read on public.beds as PERMISSIVE for SELECT to public
  using ((auth.role() = 'authenticated'::text));
create policy bin_cache_admin_write on public.bin_calendar_cache as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());
create policy bin_cache_read on public.bin_calendar_cache as PERMISSIVE for SELECT to authenticated
  using (true);
create policy "brc admin write" on public.booking_request_children as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));
create policy "brc owner write" on public.booking_request_children as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM booking_requests br
  WHERE ((br.id = booking_request_children.request_id) AND (br.requested_by = auth.uid()) AND (br.status = 'pending'::booking_request_status)))))
  with check ((EXISTS ( SELECT 1
   FROM booking_requests br
  WHERE ((br.id = booking_request_children.request_id) AND (br.requested_by = auth.uid()) AND (br.status = 'pending'::booking_request_status)))));
create policy "brc readable" on public.booking_request_children as PERMISSIVE for SELECT to authenticated
  using (true);
create policy brg_select on public.booking_request_guests as PERMISSIVE for SELECT to public
  using ((fg_is_admin() OR fg_is_cleaner() OR (EXISTS ( SELECT 1
   FROM booking_requests br
  WHERE ((br.id = booking_request_guests.request_id) AND (br.requested_by = auth.uid()))))));
create policy brg_write on public.booking_request_guests as PERMISSIVE for ALL to public
  using ((fg_is_admin() OR (EXISTS ( SELECT 1
   FROM booking_requests br
  WHERE ((br.id = booking_request_guests.request_id) AND (br.requested_by = auth.uid()))))))
  with check ((fg_is_admin() OR (EXISTS ( SELECT 1
   FROM booking_requests br
  WHERE ((br.id = booking_request_guests.request_id) AND (br.requested_by = auth.uid()))))));
create policy requests_admin_all on public.booking_requests as PERMISSIVE for ALL to public
  using (is_admin())
  with check (is_admin());
create policy requests_insert_own on public.booking_requests as PERMISSIVE for INSERT to public
  with check (((requested_by = auth.uid()) OR is_admin()));
create policy requests_select_own on public.booking_requests as PERMISSIVE for SELECT to public
  using ((is_admin() OR (requested_by = auth.uid())));
create policy requests_update_pending on public.booking_requests as PERMISSIVE for UPDATE to public
  using (((requested_by = auth.uid()) AND (status = 'pending'::booking_request_status)))
  with check (((requested_by = auth.uid()) AND (status = ANY (ARRAY['pending'::booking_request_status, 'cancelled'::booking_request_status]))));
create policy bookings_admin on public.bookings as PERMISSIVE for ALL to public
  using (is_admin())
  with check (is_admin());
create policy bookings_insert on public.bookings as PERMISSIVE for INSERT to public
  with check (((requested_by = auth.uid()) OR is_admin()));
create policy bookings_select on public.bookings as PERMISSIVE for SELECT to public
  using ((is_admin() OR (requested_by = auth.uid()) OR (status = ANY (ARRAY['approved'::booking_status, 'checked_out'::booking_status]))));
create policy bookings_update_own_pending on public.bookings as PERMISSIVE for UPDATE to public
  using (((requested_by = auth.uid()) AND (status = 'requested'::booking_status)));
create policy logs_admin_update on public.cleaner_hour_logs as PERMISSIVE for UPDATE to authenticated
  using (is_admin())
  with check (is_admin());
create policy logs_delete on public.cleaner_hour_logs as PERMISSIVE for DELETE to authenticated
  using ((is_admin() OR (cleaner_id IN ( SELECT cleaners.id
   FROM cleaners
  WHERE (cleaners.profile_id = auth.uid())))));
create policy logs_insert on public.cleaner_hour_logs as PERMISSIVE for INSERT to authenticated
  with check ((is_admin() OR (cleaner_id IN ( SELECT cleaners.id
   FROM cleaners
  WHERE (cleaners.profile_id = auth.uid())))));
create policy logs_read on public.cleaner_hour_logs as PERMISSIVE for SELECT to authenticated
  using ((is_admin() OR (cleaner_id IN ( SELECT cleaners.id
   FROM cleaners
  WHERE (cleaners.profile_id = auth.uid())))));
create policy cleaner_hours_admin_all on public.cleaner_hours as PERMISSIVE for ALL to public
  using (fg_is_admin())
  with check (fg_is_admin());
create policy pay_rates_admin_all on public.cleaner_pay_rates as PERMISSIVE for ALL to public
  using (fg_is_admin())
  with check (fg_is_admin());
create policy shifts_admin on public.cleaner_shifts as PERMISSIVE for ALL to public
  using (is_admin())
  with check (is_admin());
create policy shifts_select on public.cleaner_shifts as PERMISSIVE for SELECT to public
  using (((cleaner_id = auth.uid()) OR is_admin()));
create policy cleaners_admin on public.cleaners as PERMISSIVE for ALL to public
  using (is_admin())
  with check (is_admin());
create policy cleaners_read on public.cleaners as PERMISSIVE for SELECT to public
  using ((auth.role() = 'authenticated'::text));
create policy contacts_admin_write on public.contacts as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());
create policy contacts_read on public.contacts as PERMISSIVE for SELECT to authenticated
  using (true);
create policy expenses_delete on public.expenses as PERMISSIVE for DELETE to authenticated
  using ((is_admin() OR (created_by = auth.uid())));
create policy expenses_read on public.expenses as PERMISSIVE for SELECT to authenticated
  using (true);
create policy expenses_update on public.expenses as PERMISSIVE for UPDATE to authenticated
  using ((is_admin() OR (created_by = auth.uid())))
  with check ((is_admin() OR (created_by = auth.uid())));
create policy expenses_write on public.expenses as PERMISSIVE for INSERT to authenticated
  with check ((is_admin() OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'family'::user_role])))))));
create policy feature_flags_delete on public.feature_flags as PERMISSIVE for DELETE to public
  using (fg_is_admin());
create policy feature_flags_insert on public.feature_flags as PERMISSIVE for INSERT to public
  with check (fg_is_admin());
create policy feature_flags_select on public.feature_flags as PERMISSIVE for SELECT to public
  using (true);
create policy feature_flags_update on public.feature_flags as PERMISSIVE for UPDATE to public
  using (fg_is_admin())
  with check (fg_is_admin());
create policy guests_admin_all on public.guests as PERMISSIVE for ALL to public
  using (fg_is_admin())
  with check (fg_is_admin());
create policy house_settings_admin_read on public.house_settings as PERMISSIVE for SELECT to authenticated
  using (is_admin());
create policy house_settings_admin_write on public.house_settings as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());
create policy issues_delete on public.issues as PERMISSIVE for DELETE to public
  using (fg_is_admin());
create policy issues_insert on public.issues as PERMISSIVE for INSERT to public
  with check (((created_by = auth.uid()) AND (fg_is_admin() OR fg_is_cleaner())));
create policy issues_select on public.issues as PERMISSIVE for SELECT to public
  using ((fg_is_admin() OR fg_is_cleaner()));
create policy issues_update on public.issues as PERMISSIVE for UPDATE to public
  using ((fg_is_admin() OR (fg_is_cleaner() AND (created_by = auth.uid()))))
  with check ((fg_is_admin() OR (fg_is_cleaner() AND (created_by = auth.uid()) AND (status = 'open'::text))));
create policy linen_items_admin on public.linen_items as PERMISSIVE for ALL to public
  using (is_admin())
  with check (is_admin());
create policy linen_items_read on public.linen_items as PERMISSIVE for SELECT to public
  using ((auth.role() = 'authenticated'::text));
create policy linen_movements_admin on public.linen_movements as PERMISSIVE for ALL to public
  using (is_admin())
  with check (is_admin());
create policy linen_movements_read on public.linen_movements as PERMISSIVE for SELECT to public
  using ((auth.role() = 'authenticated'::text));
create policy messages_insert on public.messages as PERMISSIVE for INSERT to authenticated
  with check ((author_id = auth.uid()));
create policy messages_read on public.messages as PERMISSIVE for SELECT to authenticated
  using (true);
create policy messages_update_own on public.messages as PERMISSIVE for UPDATE to authenticated
  using (((author_id = auth.uid()) OR is_admin()))
  with check (((author_id = auth.uid()) OR is_admin()));
create policy oneshot_delete on public.oneshot_tasks as PERMISSIVE for DELETE to public
  using (fg_is_admin());
create policy oneshot_insert on public.oneshot_tasks as PERMISSIVE for INSERT to public
  with check ((fg_is_admin() AND (created_by = auth.uid())));
create policy oneshot_select on public.oneshot_tasks as PERMISSIVE for SELECT to public
  using ((fg_is_admin() OR fg_is_cleaner()));
create policy oneshot_update on public.oneshot_tasks as PERMISSIVE for UPDATE to public
  using ((fg_is_admin() OR fg_is_cleaner()))
  with check ((fg_is_admin() OR fg_is_cleaner()));
create policy plant_waterings_delete on public.plant_waterings as PERMISSIVE for DELETE to authenticated
  using (((watered_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))));
create policy plant_waterings_insert on public.plant_waterings as PERMISSIVE for INSERT to authenticated
  with check (((watered_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'cleaner'::user_role])))))));
create policy plant_waterings_select on public.plant_waterings as PERMISSIVE for SELECT to authenticated
  using (true);
create policy plants_admin_delete on public.plants as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));
create policy plants_admin_insert on public.plants as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));
create policy plants_admin_update on public.plants as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));
create policy plants_select on public.plants as PERMISSIVE for SELECT to authenticated
  using (true);
create policy "pc cleaner write" on public.prearrival_checks as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'cleaner'::user_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'cleaner'::user_role]))))));
create policy "pc readable" on public.prearrival_checks as PERMISSIVE for SELECT to authenticated
  using (true);
create policy "pt admin write" on public.prearrival_templates as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));
create policy "pt readable" on public.prearrival_templates as PERMISSIVE for SELECT to authenticated
  using (true);
create policy profiles_admin_all on public.profiles as PERMISSIVE for ALL to public
  using (is_admin())
  with check (is_admin());
create policy profiles_select on public.profiles as PERMISSIVE for SELECT to public
  using (((id = auth.uid()) OR is_admin()));
create policy profiles_update_self on public.profiles as PERMISSIVE for UPDATE to public
  using ((id = auth.uid()));
create policy push_delete on public.push_subscriptions as PERMISSIVE for DELETE to public
  using (((user_id = auth.uid()) OR fg_is_admin()));
create policy push_insert on public.push_subscriptions as PERMISSIVE for INSERT to public
  with check ((user_id = auth.uid()));
create policy push_select on public.push_subscriptions as PERMISSIVE for SELECT to public
  using (((user_id = auth.uid()) OR fg_is_admin()));
create policy push_update on public.push_subscriptions as PERMISSIVE for UPDATE to public
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));
create policy "linen cleaner write" on public.room_linen as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'cleaner'::user_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'cleaner'::user_role]))))));
create policy "linen readable" on public.room_linen as PERMISSIVE for SELECT to authenticated
  using (true);
create policy rooms_admin on public.rooms as PERMISSIVE for ALL to public
  using (is_admin())
  with check (is_admin());
create policy rooms_read on public.rooms as PERMISSIVE for SELECT to public
  using ((auth.role() = 'authenticated'::text));
create policy "completions deletable by self or admin" on public.task_completions as PERMISSIVE for DELETE to authenticated
  using (((completed_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))));
create policy "completions insertable by cleaners and admins" on public.task_completions as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'cleaner'::user_role]))))));
create policy "completions readable by authed users" on public.task_completions as PERMISSIVE for SELECT to authenticated
  using (true);
create policy templates_admin on public.task_templates as PERMISSIVE for ALL to public
  using (is_admin())
  with check (is_admin());
create policy templates_read on public.task_templates as PERMISSIVE for SELECT to public
  using ((auth.role() = 'authenticated'::text));
create policy tasks_admin on public.tasks as PERMISSIVE for ALL to public
  using (is_admin())
  with check (is_admin());
create policy tasks_select on public.tasks as PERMISSIVE for SELECT to public
  using (((assigned_to = auth.uid()) OR is_admin()));
create policy tasks_update_own on public.tasks as PERMISSIVE for UPDATE to public
  using ((assigned_to = auth.uid()))
  with check ((assigned_to = auth.uid()));
create policy user_feature_prefs_self_read on public.user_feature_prefs as PERMISSIVE for SELECT to authenticated
  using ((user_id = auth.uid()));
create policy user_feature_prefs_self_upsert on public.user_feature_prefs as PERMISSIVE for ALL to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));
create policy "uro own read" on public.user_room_order as PERMISSIVE for SELECT to authenticated
  using ((user_id = auth.uid()));
create policy "uro own write" on public.user_room_order as PERMISSIVE for ALL to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));
create policy wiki_pages_admin_write on public.wiki_pages as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());
create policy wiki_pages_read on public.wiki_pages as PERMISSIVE for SELECT to authenticated
  using (true);
create policy fg_attachments_storage_delete on storage.objects as PERMISSIVE for DELETE to public
  using (((bucket_id = 'attachments'::text) AND ((owner = auth.uid()) OR fg_is_admin())));
create policy fg_attachments_storage_insert on storage.objects as PERMISSIVE for INSERT to public
  with check (((bucket_id = 'attachments'::text) AND (auth.role() = 'authenticated'::text)));
create policy fg_attachments_storage_select on storage.objects as PERMISSIVE for SELECT to public
  using (((bucket_id = 'attachments'::text) AND (EXISTS ( SELECT 1
   FROM attachments a
  WHERE (a.storage_path = objects.name)))));
create policy fg_attachments_storage_update on storage.objects as PERMISSIVE for UPDATE to public
  using (((bucket_id = 'attachments'::text) AND (owner = auth.uid())))
  with check (((bucket_id = 'attachments'::text) AND (owner = auth.uid())));

-- ─── STORAGE ───────────────────────────────────────────────────────────────

-- storage bucket: attachments (public=f)


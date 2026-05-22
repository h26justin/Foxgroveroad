-- =============================================================================
-- FOXGROVE ROAD — PERFORMANCE INDEXES (v38)
-- =============================================================================
-- Composite indexes for the queries the app runs every page load.
--
-- Every booking-related page filters `bookings` on
--   status = 'approved'
-- with an overlap test against (check_in, check_out). The existing
-- indexes are only on booking_requests, not bookings, so each call
-- does a sequential scan over the full bookings table.
--
-- Adding these is safe and reversible. Run once in the Supabase SQL
-- Editor.
-- =============================================================================

-- Hot path for overlap queries on approved bookings.
create index if not exists bookings_status_dates_idx
  on bookings(status, check_in, check_out);

-- Almost-as-hot path: "what's this user's stuff?"
create index if not exists bookings_request_id_idx
  on bookings(request_id);

create index if not exists bookings_requested_by_idx
  on bookings(requested_by);

-- attachments lookups are always (kind, entity_id) pairs.
create index if not exists attachments_kind_entity_idx
  on attachments(kind, entity_id);

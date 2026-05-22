-- =============================================================================
-- FOXGROVE ROAD — CALENDAR FEED TOKENS (v36)
-- =============================================================================
-- Adds a per-user opaque token to profiles so users can subscribe to a
-- private iCal feed of their approved bookings from Apple/Google
-- Calendar.
--
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================

-- 1. Add the column
alter table profiles
  add column if not exists calendar_token text;

-- 2. Unique partial index so tokens are guaranteed distinct.
create unique index if not exists profiles_calendar_token_uniq
  on profiles(calendar_token)
  where calendar_token is not null;

-- 3. Backfill existing users with a random 64-char hex token.
update profiles
   set calendar_token = encode(gen_random_bytes(32), 'hex')
 where calendar_token is null;

-- 4. Auto-set the token on insert so new signups get one without the
--    application code having to remember.
create or replace function set_calendar_token()
returns trigger
language plpgsql
as $$
begin
  if new.calendar_token is null then
    new.calendar_token := encode(gen_random_bytes(32), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_calendar_token on profiles;
create trigger profiles_set_calendar_token
  before insert on profiles
  for each row
  execute function set_calendar_token();

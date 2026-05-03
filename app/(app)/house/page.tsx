import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayISO } from '@/lib/dates'
import HouseClient from './HouseClient'

/** Snap to first of the month for the given ISO date. */
function firstOfMonthISO(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function addMonthsISO(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00')
  return new Date(d.getFullYear(), d.getMonth() + delta, 1)
    .toISOString()
    .slice(0, 10)
}
function daysInMonthISO(iso: string): number {
  const d = new Date(iso + 'T00:00:00')
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

export default async function HousePage({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string
    booking?: string
    request?: string
    saved?: string
    error?: string
  }>
}) {
  const [profile, sp, supabase] = await Promise.all([
    requireProfile(),
    searchParams,
    createClient(),
  ])

  const isAdmin = profile.role === 'admin'
  const today = todayISO()
  const startISO = firstOfMonthISO(sp.start || today)
  const startDateObj = new Date(startISO + 'T00:00:00')
  const DAYS_VISIBLE = daysInMonthISO(startISO)

  const days: string[] = []
  for (let i = 0; i < DAYS_VISIBLE; i++) {
    const d = new Date(startDateObj)
    d.setDate(d.getDate() + i)
    days.push(d.toISOString().slice(0, 10))
  }
  const endISO = days[days.length - 1]
  const monthLabel = startDateObj.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  // ── Parallel data fetch ──────────────────────────────────────────────
  // Everything the page needs in one round-trip burst.
  const [
    roomsRes,
    bedsRes,
    visibleBookingsRes,
    visibleRequestsRes,
    childrenRes,
    templatesRes,
    checksRes,
    pendingCountRes,
    needsBedsRes,
  ] = await Promise.all([
    // Rooms (bedrooms only — non-bedrooms aren't bookable)
    supabase
      .from('rooms')
      .select('id, name, floor, room_type, is_owner_room, can_fit_cot')
      .eq('room_type', 'bedroom')
      .order('floor', { ascending: false })
      .order('name'),
    // All beds — needed for the panel's bed grid
    supabase
      .from('beds')
      .select('id, name, bed_type, room_id'),
    // Approved bed-level bookings overlapping the visible window
    supabase
      .from('bookings')
      .select(
        'id, bed_id, check_in, check_out, request_id, guest_name, status, beds:beds!bookings_bed_id_fkey(room_id), profiles:profiles!bookings_requested_by_fkey(full_name)'
      )
      .in('status', ['approved'])
      .lt('check_in', endISO)
      .gt('check_out', startISO)
      .order('check_in'),
    // Booking requests overlapping the window — pending + approved
    supabase
      .from('booking_requests')
      .select(
        'id, check_in, check_out, adults, adults_sharing, children, notes, status, requested_by, profiles:profiles!booking_requests_requested_by_fkey(full_name)'
      )
      .in('status', ['pending', 'approved'])
      .lt('check_in', endISO)
      .gt('check_out', startISO)
      .order('check_in'),
    // Children rows for any of those requests (we'll filter client-side)
    supabase
      .from('booking_request_children')
      .select('id, request_id, age_band, sleep_arrangement, position'),
    // Pre-arrival templates per room
    supabase
      .from('prearrival_templates')
      .select('id, room_id, name, position')
      .order('position'),
    // Existing checks for any booking_request (we'll filter to selected one
    // client-side; small data so it's fine)
    supabase
      .from('prearrival_checks')
      .select('id, booking_request_id, template_id, room_id'),
    // Status-strip counter: pending requests (across all time)
    isAdmin
      ? supabase
          .from('booking_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
      : Promise.resolve({ count: 0 } as any),
    // Status-strip counter: approved requests with no bed assignments yet
    isAdmin
      ? supabase
          .from('booking_requests')
          .select('id, status, bookings:bookings!bookings_request_id_fkey(id)')
          .eq('status', 'approved')
          .gte('check_out', today)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const rooms = (roomsRes.data as any[]) ?? []
  const beds = (bedsRes.data as any[]) ?? []
  const visibleBookings = (visibleBookingsRes.data as any[]) ?? []
  const visibleRequests = (visibleRequestsRes.data as any[]) ?? []
  const allChildren = (childrenRes.data as any[]) ?? []
  const templates = (templatesRes.data as any[]) ?? []
  const checks = (checksRes.data as any[]) ?? []
  const pendingCount = pendingCountRes.count ?? 0

  // Admin-only: fetch profile notes for every requester whose request is
  // visible. The slide-over surfaces these as a condensed read-only
  // summary. Cleaner/family users never see other people's notes.
  const profileNotesById: Record<
    string,
    {
      dietary_notes: string | null
      allergies: string | null
      room_preference: string | null
      things_they_bring: string | null
      general_notes: string | null
    }
  > = {}
  if (isAdmin) {
    const requesterIds = Array.from(
      new Set(visibleRequests.map((r: any) => r.requested_by).filter(Boolean)),
    )
    if (requesterIds.length > 0) {
      const { data: notesRows } = await supabase
        .from('profiles')
        .select(
          'id, dietary_notes, allergies, room_preference, things_they_bring, general_notes',
        )
        .in('id', requesterIds)
      for (const r of (notesRows as any[]) ?? []) {
        profileNotesById[r.id] = {
          dietary_notes: r.dietary_notes,
          allergies: r.allergies,
          room_preference: r.room_preference,
          things_they_bring: r.things_they_bring,
          general_notes: r.general_notes,
        }
      }
    }
  }

  // Compute "needs beds" count
  const needsBedsCount =
    ((needsBedsRes.data as any[]) ?? []).filter(
      (r) => !r.bookings || r.bookings.length === 0
    ).length

  // "Staying tonight" + "arriving tomorrow" + "cots needed this month"
  const stayingTonight = visibleBookings.filter(
    (b) => b.check_in <= today && b.check_out > today
  ).length

  const tomorrow = (() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })()
  const arrivingTomorrow = visibleBookings.filter(
    (b) => b.check_in === tomorrow
  ).length

  const cotsNeededThisMonth = allChildren.filter(
    (c) =>
      c.sleep_arrangement === 'cot' &&
      visibleRequests.some((r) => r.id === c.request_id)
  ).length

  // Build per-room beds map for the panel
  const bedsByRoom = new Map<string, any[]>()
  for (const b of beds) {
    if (!bedsByRoom.has(b.room_id)) bedsByRoom.set(b.room_id, [])
    bedsByRoom.get(b.room_id)!.push(b)
  }
  const roomsWithBeds = rooms.map((r) => ({
    ...r,
    beds: bedsByRoom.get(r.id) ?? [],
  }))

  return (
    <HouseClient
      profile={profile}
      isAdmin={isAdmin}
      today={today}
      monthLabel={monthLabel}
      startISO={startISO}
      endISO={endISO}
      days={days}
      prevStart={addMonthsISO(startISO, -1)}
      nextStart={addMonthsISO(startISO, +1)}
      thisMonthStart={firstOfMonthISO(today)}
      rooms={roomsWithBeds}
      visibleBookings={visibleBookings}
      visibleRequests={visibleRequests}
      allChildren={allChildren}
      templates={templates}
      checks={checks}
      profileNotesById={profileNotesById}
      statusCounts={{
        stayingTonight,
        arrivingTomorrow,
        pendingCount,
        needsBedsCount,
        cotsNeededThisMonth,
      }}
      selectedBookingId={sp.booking ?? null}
      selectedRequestId={sp.request ?? null}
      savedMessage={sp.saved ?? null}
      errorMessage={sp.error ?? null}
    />
  )
}

import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  formatDateRange,
  relativeFromToday,
  todayISO,
} from '@/lib/dates'
import { approveRequest, declineRequest } from './actions'
import BookingsCalendar from './BookingsCalendar'

/** Return YYYY-MM-01 for the month containing the given ISO date. */
function firstOfMonthISO(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

/** Add ±N months to a YYYY-MM-01 date. */
function addMonthsISO(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00')
  return new Date(d.getFullYear(), d.getMonth() + delta, 1).toISOString().slice(0, 10)
}

/** Number of days in the month containing the given YYYY-MM-01 date. */
function daysInMonthISO(iso: string): number {
  const d = new Date(iso + 'T00:00:00')
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string
    approved?: string
    declined?: string
    moved?: string
    error?: string
  }>
}) {
  await requireAdmin()
  const supabase = await createClient()
  const { start, approved, declined, moved, error } = await searchParams

  // Always snap to the first of a month — the page is now month-based.
  const startISO = firstOfMonthISO(start || todayISO())
  const startDateObj = new Date(startISO + 'T00:00:00')
  const DAYS_VISIBLE = daysInMonthISO(startISO)

  const days: string[] = []
  for (let i = 0; i < DAYS_VISIBLE; i++) {
    const d = new Date(startDateObj)
    d.setDate(d.getDate() + i)
    days.push(d.toISOString().slice(0, 10))
  }
  const endISO = days[days.length - 1]

  const prevStart = addMonthsISO(startISO, -1)
  const nextStart = addMonthsISO(startISO, +1)
  const thisMonthStart = firstOfMonthISO(todayISO())
  const monthLabel = startDateObj.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  // Rooms (for the row labels) — only bedrooms; other rooms (kitchen, bathrooms, etc.)
  // exist for the cleaning rota but aren't bookable
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, floor, is_owner_room')
    .eq('room_type', 'bedroom')
    .order('floor', { ascending: false })
    .order('name')

  // Bed-level approved bookings overlapping the visible window
  const { data: visibleBookings } = await supabase
    .from('bookings')
    .select(
      'id, bed_id, check_in, check_out, request_id, guest_name, beds:beds!bookings_bed_id_fkey(room_id), profiles:profiles!bookings_requested_by_fkey(full_name)'
    )
    .eq('status', 'approved')
    .lt('check_in', endISO)
    .gt('check_out', startISO)
    .order('check_in')

  // Booking requests overlapping the window (pending + approved)
  const { data: visibleRequests } = await supabase
    .from('booking_requests')
    .select(
      'id, check_in, check_out, adults, children, notes, status, profiles:profiles!booking_requests_requested_by_fkey(full_name)'
    )
    .lt('check_in', endISO)
    .gt('check_out', startISO)
    .in('status', ['pending', 'approved'])
    .order('check_in')

  const pendingVisible = (visibleRequests ?? []).filter(
    (r) => r.status === 'pending'
  )

  // For each approved request, check if it has any bed bookings yet
  const requestIdsWithBookings = new Set(
    (visibleBookings ?? [])
      .map((b) => b.request_id)
      .filter(Boolean) as string[]
  )
  const approvedUnassigned = (visibleRequests ?? []).filter(
    (r) => r.status === 'approved' && !requestIdsWithBookings.has(r.id)
  )

  // Group bed bookings by room for the row rendering
  const bookingsByRoom = new Map<string, any[]>()
  for (const b of visibleBookings ?? []) {
    const roomId = (b.beds as any)?.room_id
    if (!roomId) continue
    if (!bookingsByRoom.has(roomId)) bookingsByRoom.set(roomId, [])
    bookingsByRoom.get(roomId)!.push(b)
  }

  // Pending requests management list (all of them)
  const { data: allPending } = await supabase
    .from('booking_requests')
    .select(
      'id, check_in, check_out, adults, adults_sharing, children, notes, status, profiles:profiles!booking_requests_requested_by_fkey(full_name), booking_request_children(id, age_band, sleep_arrangement, position)'
    )
    .eq('status', 'pending')
    .order('check_in', { ascending: true })

  // Approved requests (for "needs bed assignment" list)
  const { data: allApproved } = await supabase
    .from('booking_requests')
    .select(
      'id, check_in, check_out, adults, children, status, profiles:profiles!booking_requests_requested_by_fkey(full_name)'
    )
    .eq('status', 'approved')
    .gte('check_out', todayISO())
    .order('check_in', { ascending: true })

  // Find approved requests with no bed bookings yet (need assignment)
  const { data: anyBookings } = await supabase
    .from('bookings')
    .select('request_id')
    .eq('status', 'approved')
    .gte('check_out', todayISO())

  const assignedRequestIds = new Set(
    (anyBookings ?? []).map((b) => b.request_id).filter(Boolean) as string[]
  )
  const needsAssignment = (allApproved ?? []).filter(
    (r) => !assignedRequestIds.has(r.id)
  )

  // Recent decisions
  const { data: recent } = await supabase
    .from('booking_requests')
    .select(
      'id, check_in, check_out, adults, children, status, decided_at, admin_notes, profiles:profiles!booking_requests_requested_by_fkey(full_name)'
    )
    .in('status', ['approved', 'declined'])
    .order('decided_at', { ascending: false })
    .limit(10)

  return (
    <div>
      <div className="mb-8">
        <h1
          className="text-3xl mb-2"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          Bookings calendar
        </h1>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          {monthLabel}
        </p>
      </div>

      {approved && (
        <div className="fg-msg-success mb-6">Request approved.</div>
      )}
      {declined && <div className="fg-msg-success mb-6">Request declined.</div>}
      {moved && <div className="fg-msg-success mb-6">Booking moved.</div>}
      {error && <div className="fg-msg-error mb-6">{error}</div>}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/admin/bookings?start=${prevStart}`}
            className="fg-btn-ghost text-sm"
          >
            ← Previous month
          </Link>
          <Link
            href={`/admin/bookings?start=${thisMonthStart}`}
            className="fg-btn-ghost text-sm"
          >
            This month
          </Link>
          <Link
            href={`/admin/bookings?start=${nextStart}`}
            className="fg-btn-ghost text-sm"
          >
            Next month →
          </Link>
        </div>
      </div>

      <BookingsCalendar
        days={days}
        rooms={(rooms as any[]) ?? []}
        pending={pendingVisible as any[]}
        approvedUnassigned={approvedUnassigned as any[]}
        bookingsByRoom={Object.fromEntries(bookingsByRoom)}
        startISO={startISO}
        currentMonthStart={startISO}
      />

      {/* Approved waiting for bed assignment */}
      {needsAssignment.length > 0 && (
        <section className="mt-12 mb-12">
          <h2 className="fg-section-label mb-3">
            Needs bed assignment ({needsAssignment.length})
          </h2>
          <div className="space-y-3">
            {needsAssignment.map((r) => (
              <NeedsAssignmentRow key={r.id} req={r} />
            ))}
          </div>
        </section>
      )}

      {/* Pending requests management */}
      <section className="mt-12 mb-12">
        <h2 className="fg-section-label mb-3">
          Pending requests
          {allPending && allPending.length > 0 && ` (${allPending.length})`}
        </h2>

        {!allPending || allPending.length === 0 ? (
          <div
            className="fg-card p-8 text-center"
            style={{ color: 'var(--color-muted)' }}
          >
            <p className="text-sm">No pending requests right now. ☕</p>
          </div>
        ) : (
          <div className="space-y-3">
            {allPending.map((req) => (
              <PendingCard key={req.id} req={req} />
            ))}
          </div>
        )}
      </section>

      {recent && recent.length > 0 && (
        <section>
          <h2 className="fg-section-label mb-3">Recently decided</h2>
          <div className="space-y-2">
            {recent.map((req) => (
              <DecidedRow key={req.id} req={req} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ---------- Lists ----------

function NeedsAssignmentRow({ req }: any) {
  const name = (req.profiles as any)?.full_name ?? 'Unknown'
  const guests = req.adults + req.children
  return (
    <div className="fg-card p-4 flex items-center justify-between gap-3">
      <div>
        <div className="text-sm" style={{ color: 'var(--color-ink)' }}>
          {name}
        </div>
        <div
          className="text-xs fg-mono mt-1"
          style={{ color: 'var(--color-muted)' }}
        >
          {formatDateRange(req.check_in, req.check_out)} · {guests} guest
          {guests === 1 ? '' : 's'}
        </div>
      </div>
      <Link
        href={`/admin/bookings/${req.id}/assign`}
        className="fg-btn-gold text-sm"
      >
        Assign beds →
      </Link>
    </div>
  )
}

function PendingCard({ req }: any) {
  const requesterName = (req.profiles as any)?.full_name ?? 'Unknown family member'
  const isPast = req.check_out < todayISO()

  // Build a human-readable sleeping summary
  const childRows: any[] = req.booking_request_children ?? []
  const cotCount = childRows.filter((c) => c.sleep_arrangement === 'cot').length
  const ownBedCount = childRows.filter((c) => c.sleep_arrangement === 'own_bed').length
  const sharingCount = childRows.filter((c) => c.sleep_arrangement === 'sharing_with_parent').length

  const adultsLine =
    req.adults === 1
      ? '1 adult'
      : req.adults_sharing === false
        ? `${req.adults} adults — separate beds`
        : `${req.adults} adults — sharing`

  const childParts: string[] = []
  if (ownBedCount > 0) childParts.push(`${ownBedCount} child${ownBedCount === 1 ? '' : 'ren'} in own bed${ownBedCount === 1 ? '' : 's'}`)
  if (sharingCount > 0) childParts.push(`${sharingCount} child${sharingCount === 1 ? '' : 'ren'} sharing with parent`)
  if (cotCount > 0) childParts.push(`${cotCount} cot${cotCount === 1 ? '' : 's'} (guest brings)`)

  return (
    <div className="fg-card-elevated p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-base"
              style={{
                fontFamily: 'var(--font-serif)',
                color: 'var(--color-ink)',
              }}
            >
              {requesterName}
            </span>
            {isPast && (
              <span className="fg-pill fg-pill-muted text-xs">past dates</span>
            )}
          </div>
          <div className="text-sm mb-1" style={{ color: 'var(--color-ink)' }}>
            {formatDateRange(req.check_in, req.check_out)}
          </div>
          <div
            className="text-xs fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            {adultsLine}
            {childParts.length > 0 && ` · ${childParts.join(' · ')}`}
            {' · check-in '}
            {relativeFromToday(req.check_in)}
          </div>
          {cotCount > 0 && (
            <div
              className="text-xs fg-mono mt-2"
              style={{ color: 'var(--color-amber)' }}
            >
              ⚠️ {cotCount} cot{cotCount === 1 ? '' : 's'} needed — assign to a room with cot space.
            </div>
          )}
          {req.notes && (
            <p
              className="text-sm mt-3 px-3 py-2 rounded-md"
              style={{
                background: 'var(--color-cream)',
                color: 'var(--color-ink)',
              }}
            >
              {req.notes}
            </p>
          )}
        </div>
      </div>

      <div
        className="flex items-center gap-2 pt-3 border-t"
        style={{ borderColor: 'var(--color-warm)' }}
      >
        <form action={approveRequest}>
          <input type="hidden" name="id" value={req.id} />
          <button type="submit" className="fg-btn-primary text-sm">
            Approve
          </button>
        </form>

        <form action={declineRequest} className="flex items-center gap-2 flex-1">
          <input type="hidden" name="id" value={req.id} />
          <input
            type="text"
            name="reason"
            placeholder="Reason (optional, sent to family)"
            className="fg-input text-sm flex-1"
            style={{ padding: '6px 10px' }}
            maxLength={200}
          />
          <button
            type="submit"
            className="fg-btn-ghost text-sm"
            style={{ color: 'var(--color-red)' }}
          >
            Decline
          </button>
        </form>
      </div>
    </div>
  )
}

function DecidedRow({ req }: any) {
  const name = (req.profiles as any)?.full_name ?? 'Unknown'
  return (
    <div className="fg-card px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: 'var(--color-ink)' }}>
            {name}
          </span>
          <span
            className="text-xs fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            {formatDateRange(req.check_in, req.check_out)}
          </span>
        </div>
        {req.admin_notes && (
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
            “{req.admin_notes}”
          </p>
        )}
      </div>
      <StatusPill status={req.status} />
    </div>
  )
}

function StatusPill({ status }: any) {
  const map: Record<string, string> = {
    pending: 'fg-pill fg-pill-amber',
    approved: 'fg-pill fg-pill-green',
    declined: 'fg-pill fg-pill-red',
    cancelled: 'fg-pill fg-pill-muted',
  }
  return <span className={map[status] ?? 'fg-pill'}>{status}</span>
}

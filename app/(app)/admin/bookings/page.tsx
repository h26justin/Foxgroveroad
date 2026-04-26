import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  formatDate,
  formatDateRange,
  nightsBetween,
  relativeFromToday,
  todayISO,
} from '@/lib/dates'
import { approveRequest, declineRequest } from './actions'

const DAYS_VISIBLE = 30

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string
    approved?: string
    declined?: string
  }>
}) {
  await requireAdmin()
  const supabase = await createClient()
  const { start, approved, declined } = await searchParams

  const startISO = start || todayISO()
  const startDateObj = new Date(startISO + 'T00:00:00')

  const days: string[] = []
  for (let i = 0; i < DAYS_VISIBLE; i++) {
    const d = new Date(startDateObj)
    d.setDate(d.getDate() + i)
    days.push(d.toISOString().slice(0, 10))
  }
  const endISO = days[days.length - 1]

  const prevStart = (() => {
    const d = new Date(startDateObj)
    d.setDate(d.getDate() - DAYS_VISIBLE)
    return d.toISOString().slice(0, 10)
  })()
  const nextStart = (() => {
    const d = new Date(startDateObj)
    d.setDate(d.getDate() + DAYS_VISIBLE)
    return d.toISOString().slice(0, 10)
  })()

  // Rooms (for the row labels)
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, floor, is_owner_room')
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
      'id, check_in, check_out, adults, children, notes, status, profiles:profiles!booking_requests_requested_by_fkey(full_name)'
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
          {formatDate(days[0])} → {formatDate(days[days.length - 1])}
        </p>
      </div>

      {approved && (
        <div className="fg-msg-success mb-6">Request approved.</div>
      )}
      {declined && <div className="fg-msg-success mb-6">Request declined.</div>}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/bookings?start=${prevStart}`}
            className="fg-btn-ghost text-sm"
          >
            ← Previous {DAYS_VISIBLE} days
          </Link>
          <Link
            href={`/admin/bookings?start=${todayISO()}`}
            className="fg-btn-ghost text-sm"
          >
            Today
          </Link>
          <Link
            href={`/admin/bookings?start=${nextStart}`}
            className="fg-btn-ghost text-sm"
          >
            Next {DAYS_VISIBLE} days →
          </Link>
        </div>
      </div>

      <Calendar
        days={days}
        rooms={rooms ?? []}
        pending={pendingVisible}
        approvedUnassigned={approvedUnassigned}
        bookingsByRoom={bookingsByRoom}
        startISO={startISO}
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

// ---------- Calendar grid ----------

function Calendar({
  days,
  rooms,
  pending,
  approvedUnassigned,
  bookingsByRoom,
  startISO,
}: any) {
  const totalDays = days.length
  const dayWidthPx = 36

  return (
    <div className="fg-card overflow-x-auto" style={{ padding: 0 }}>
      <div
        className="relative"
        style={{ minWidth: `${260 + totalDays * dayWidthPx}px` }}
      >
        {/* Header */}
        <div
          className="flex border-b"
          style={{ borderColor: 'var(--color-warm)' }}
        >
          <div
            className="shrink-0 px-4 py-3 fg-section-label flex items-center"
            style={{ width: 260 }}
          >
            Date →
          </div>
          <div className="flex flex-1">
            {days.map((iso: string, idx: number) => (
              <DayHeader
                key={iso}
                iso={iso}
                showMonth={idx === 0 || iso.endsWith('-01')}
                widthPx={dayWidthPx}
              />
            ))}
          </div>
        </div>

        {/* Pending lane */}
        <Lane
          label={`Pending (${pending.length})`}
          sublabel="awaiting your review"
          requests={pending}
          startISO={startISO}
          totalDays={totalDays}
          dayWidthPx={dayWidthPx}
          color="amber"
        />

        {/* Approved-unassigned lane */}
        <Lane
          label={`Approved (${approvedUnassigned.length})`}
          sublabel="needs bed assignment"
          requests={approvedUnassigned}
          startISO={startISO}
          totalDays={totalDays}
          dayWidthPx={dayWidthPx}
          color="green"
          showAssignLink
        />

        <div
          className="border-t-2"
          style={{ borderColor: 'var(--color-warm)' }}
        />

        {/* Room rows */}
        {rooms.map((room: any) => (
          <RoomRow
            key={room.id}
            room={room}
            days={days}
            dayWidthPx={dayWidthPx}
            bookings={bookingsByRoom.get(room.id) ?? []}
            startISO={startISO}
            totalDays={totalDays}
          />
        ))}
      </div>
    </div>
  )
}

function DayHeader({ iso, showMonth, widthPx }: any) {
  const date = new Date(iso + 'T00:00:00')
  const day = date.getDate()
  const dow = date.toLocaleDateString('en-GB', { weekday: 'short' })[0]
  const isToday = iso === todayISO()
  const isWeekend = date.getDay() === 0 || date.getDay() === 6
  const monthLabel = date.toLocaleDateString('en-GB', { month: 'short' })

  return (
    <div
      className="shrink-0 text-center py-2 border-r relative"
      style={{
        width: widthPx,
        borderColor: 'var(--color-warm)',
        background: isWeekend ? 'var(--color-cream)' : 'transparent',
      }}
    >
      {showMonth && (
        <div
          className="absolute top-0 left-1 text-[10px] fg-mono uppercase"
          style={{ color: 'var(--color-gold)' }}
        >
          {monthLabel}
        </div>
      )}
      <div
        className="text-[10px] fg-mono"
        style={{ color: 'var(--color-muted)' }}
      >
        {dow}
      </div>
      <div
        className="text-sm"
        style={{
          color: isToday ? 'var(--color-gold)' : 'var(--color-ink)',
          fontWeight: isToday ? 700 : 400,
        }}
      >
        {day}
      </div>
    </div>
  )
}

function Lane({
  label,
  sublabel,
  requests,
  startISO,
  totalDays,
  dayWidthPx,
  color,
  showAssignLink = false,
}: any) {
  return (
    <div
      className="flex border-b items-stretch"
      style={{ borderColor: 'var(--color-warm)' }}
    >
      <div className="shrink-0 px-4 py-3" style={{ width: 260 }}>
        <div
          className="text-sm"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          {label}
        </div>
        <div
          className="text-[10px] fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          {sublabel}
        </div>
      </div>
      <div
        className="relative flex-1"
        style={{ minHeight: 56, width: totalDays * dayWidthPx }}
      >
        {Array.from({ length: totalDays }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 border-r"
            style={{
              left: i * dayWidthPx,
              width: dayWidthPx,
              borderColor: 'var(--color-warm)',
              opacity: 0.5,
            }}
          />
        ))}
        {requests.map((req: any) => (
          <RequestBar
            key={req.id}
            request={req}
            startISO={startISO}
            totalDays={totalDays}
            dayWidthPx={dayWidthPx}
            color={color}
            assignLink={showAssignLink}
          />
        ))}
      </div>
    </div>
  )
}

function RoomRow({ room, days, dayWidthPx, bookings, startISO, totalDays }: any) {
  return (
    <div
      className="flex border-b items-stretch"
      style={{ borderColor: 'var(--color-warm)' }}
    >
      <div className="shrink-0 px-4 py-3" style={{ width: 260 }}>
        <div
          className="text-sm"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          {room.name}
        </div>
        <div
          className="text-[10px] fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          {room.is_owner_room
            ? 'owner only'
            : `${room.floor === 0 ? 'garden' : room.floor === 1 ? '1st' : 'attic'} floor`}
        </div>
      </div>
      <div
        className="relative flex-1"
        style={{ minHeight: 56, width: days.length * dayWidthPx }}
      >
        {Array.from({ length: days.length }).map((_, i) => {
          const isWeekend = (() => {
            const d = new Date(days[i] + 'T00:00:00')
            return d.getDay() === 0 || d.getDay() === 6
          })()
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0 border-r"
              style={{
                left: i * dayWidthPx,
                width: dayWidthPx,
                borderColor: 'var(--color-warm)',
                opacity: 0.5,
                background: isWeekend ? 'var(--color-cream)' : 'transparent',
              }}
            />
          )
        })}
        {bookings.map((b: any) => (
          <BookingBar
            key={b.id}
            booking={b}
            startISO={startISO}
            totalDays={totalDays}
            dayWidthPx={dayWidthPx}
          />
        ))}
      </div>
    </div>
  )
}

function RequestBar({
  request,
  startISO,
  totalDays,
  dayWidthPx,
  color,
  assignLink,
}: any) {
  const startOffset = nightsBetween(startISO, request.check_in)
  const endOffset = nightsBetween(startISO, request.check_out)
  const visibleStart = Math.max(0, startOffset)
  const visibleEnd = Math.min(totalDays, endOffset)
  if (visibleEnd <= visibleStart) return null

  const leftPx = visibleStart * dayWidthPx
  const widthPx = (visibleEnd - visibleStart) * dayWidthPx
  const guestCount = request.adults + request.children
  const requesterName = request.profiles?.full_name ?? 'Unknown'
  const bg = color === 'amber' ? 'var(--color-amber)' : 'var(--color-green)'

  const inner = (
    <div
      className="absolute rounded text-xs flex items-center px-2 overflow-hidden hover:shadow-md transition-shadow"
      style={{
        left: leftPx + 2,
        width: widthPx - 4,
        top: 8,
        height: 40,
        background: bg,
        color: 'white',
        fontWeight: 500,
        cursor: assignLink ? 'pointer' : 'default',
      }}
      title={`${requesterName} · ${formatDateRange(request.check_in, request.check_out)} · ${guestCount} guest${guestCount === 1 ? '' : 's'}${request.notes ? `\nNotes: ${request.notes}` : ''}${assignLink ? '\n\nClick to assign beds' : ''}`}
    >
      <span className="truncate">
        {requesterName} · {guestCount}p
      </span>
    </div>
  )

  if (assignLink) {
    return <Link href={`/admin/bookings/${request.id}/assign`}>{inner}</Link>
  }
  return inner
}

function BookingBar({ booking, startISO, totalDays, dayWidthPx }: any) {
  const startOffset = nightsBetween(startISO, booking.check_in)
  const endOffset = nightsBetween(startISO, booking.check_out)
  const visibleStart = Math.max(0, startOffset)
  const visibleEnd = Math.min(totalDays, endOffset)
  if (visibleEnd <= visibleStart) return null

  const leftPx = visibleStart * dayWidthPx
  const widthPx = (visibleEnd - visibleStart) * dayWidthPx
  const name = booking.profiles?.full_name ?? booking.guest_name

  return (
    <Link
      href={
        booking.request_id
          ? `/admin/bookings/${booking.request_id}/assign`
          : '/admin/bookings'
      }
    >
      <div
        className="absolute rounded text-xs flex items-center px-2 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
        style={{
          left: leftPx + 2,
          width: widthPx - 4,
          top: 8,
          height: 40,
          background: 'var(--color-green)',
          color: 'white',
          fontWeight: 500,
        }}
        title={`${name} · ${formatDateRange(booking.check_in, booking.check_out)}\n\nClick to manage`}
      >
        <span className="truncate">{name}</span>
      </div>
    </Link>
  )
}

// ---------- Lists ----------

function NeedsAssignmentRow({ req }: any) {
  const name = req.profiles?.full_name ?? 'Unknown'
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
  const requesterName = req.profiles?.full_name ?? 'Unknown family member'
  const isPast = req.check_out < todayISO()

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
            {req.adults} adult{req.adults === 1 ? '' : 's'}
            {req.children > 0 &&
              `, ${req.children} child${req.children === 1 ? '' : 'ren'}`}
            {' · check-in '}
            {relativeFromToday(req.check_in)}
          </div>
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
  const name = req.profiles?.full_name ?? 'Unknown'
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

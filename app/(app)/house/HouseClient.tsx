'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import BookingsCalendar from '../admin/bookings/BookingsCalendar'
import BookingPanel from './BookingPanel'
import { formatDateRange } from '@/lib/dates'

type Profile = { id: string; full_name: string; role: string }

type Booking = {
  id: string
  bed_id: string
  check_in: string
  check_out: string
  request_id: string | null
  guest_name: string | null
  guest_id?: string | null
  status: string
  beds: { room_id: string } | null
  profiles: { full_name: string } | null
}

type Request = {
  id: string
  check_in: string
  check_out: string
  adults: number
  adults_sharing?: boolean
  children: number
  notes: string | null
  status: string
  requested_by: string
  profiles: { full_name: string } | null
}

type Bed = { id: string; name: string; bed_type: string; room_id: string }
type Room = {
  id: string
  name: string
  floor: number
  room_type: string
  is_owner_room: boolean
  can_fit_cot: boolean
  beds: Bed[]
}

type ChildRow = {
  id: string
  request_id: string
  age_band: 'infant' | 'toddler' | 'child'
  sleep_arrangement: 'cot' | 'own_bed' | 'sharing_with_parent'
  position: number
}

type Template = { id: string; room_id: string; name: string; position: number }
type Check = {
  id: string
  booking_request_id: string
  template_id: string
  room_id: string | null
}

export default function HouseClient({
  profile,
  isAdmin,
  today,
  monthLabel,
  startISO,
  endISO,
  days,
  prevStart,
  nextStart,
  thisMonthStart,
  rooms,
  visibleBookings,
  visibleRequests,
  allChildren,
  templates,
  checks,
  requesterGuestNotesById,
  guestsByRequest,
  allGuestsForPicker,
  linkableProfilesForPicker,
  statusCounts,
  selectedBookingId,
  selectedRequestId,
  savedMessage,
  errorMessage,
}: {
  profile: Profile
  isAdmin: boolean
  today: string
  monthLabel: string
  startISO: string
  endISO: string
  days: string[]
  prevStart: string
  nextStart: string
  thisMonthStart: string
  rooms: Room[]
  visibleBookings: Booking[]
  visibleRequests: Request[]
  allChildren: ChildRow[]
  templates: Template[]
  checks: Check[]
  requesterGuestNotesById: Record<
    string,
    {
      guest_id: string
      full_name: string
      dietary_notes: string | null
      allergies: string | null
      room_preference: string | null
      things_they_bring: string | null
      general_notes: string | null
    }
  >
  guestsByRequest: Record<
    string,
    {
      guest_id: string
      full_name: string
      linked_profile_id: string | null
      position: number
    }[]
  >
  allGuestsForPicker: {
    id: string
    full_name: string
    linked: boolean
    role: string | null
  }[]
  linkableProfilesForPicker: {
    id: string
    full_name: string
    role: string
  }[]
  statusCounts: {
    stayingTonight: number
    arrivingTomorrow: number
    pendingCount: number
    needsBedsCount: number
    cotsNeededThisMonth: number
  }
  selectedBookingId: string | null
  selectedRequestId: string | null
  savedMessage: string | null
  errorMessage: string | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Anonymise non-admin view: hide guest names, hide actions.
  const showNames = isAdmin
  // Owner is also allowed to see their own family's names — keep simple for now.

  // Drive panel via URL params so refresh keeps state.
  const openPanel = (params: { booking?: string | null; request?: string | null }) => {
    const sp = new URLSearchParams(searchParams?.toString() ?? '')
    if (params.booking != null) sp.set('booking', params.booking)
    else sp.delete('booking')
    if (params.request != null) sp.set('request', params.request)
    else sp.delete('request')
    router.push(`/house?${sp.toString()}`, { scroll: false })
  }
  const closePanel = () => openPanel({ booking: null, request: null })

  const handleBookingTap = (bookingId: string) => {
    if (!isAdmin) return // non-admin: read-only, no panel
    openPanel({ booking: bookingId, request: null })
  }
  const handleRequestTap = (requestId: string) => {
    if (!isAdmin) return
    openPanel({ booking: null, request: requestId })
  }

  // Pending and unassigned approved requests for the compact strip
  const pendingVisible = useMemo(
    () => visibleRequests.filter((r) => r.status === 'pending'),
    [visibleRequests]
  )
  const requestIdsWithBookings = useMemo(() => {
    const s = new Set<string>()
    for (const b of visibleBookings) {
      if (b.request_id) s.add(b.request_id)
    }
    return s
  }, [visibleBookings])
  const approvedUnassigned = useMemo(
    () =>
      visibleRequests.filter(
        (r) => r.status === 'approved' && !requestIdsWithBookings.has(r.id)
      ),
    [visibleRequests, requestIdsWithBookings]
  )

  // Anonymise booking + request data for non-admin view
  const calendarBookings = useMemo(() => {
    if (showNames) return visibleBookings
    return visibleBookings.map((b) => ({
      ...b,
      guest_name: 'Booked',
      profiles: b.profiles ? { full_name: 'Booked' } : null,
    }))
  }, [visibleBookings, showNames])

  const calendarBookingsByRoom: Record<string, Booking[]> = useMemo(() => {
    const m: Record<string, Booking[]> = {}
    for (const b of calendarBookings) {
      const roomId = b.beds?.room_id
      if (!roomId) continue
      if (!m[roomId]) m[roomId] = []
      m[roomId].push(b)
    }
    return m
  }, [calendarBookings])

  // Active panel data lookup
  const selectedBooking =
    selectedBookingId
      ? visibleBookings.find((b) => b.id === selectedBookingId) ?? null
      : null
  const selectedRequest =
    selectedRequestId
      ? visibleRequests.find((r) => r.id === selectedRequestId) ?? null
      : (selectedBooking?.request_id
          ? visibleRequests.find((r) => r.id === selectedBooking.request_id) ?? null
          : null)

  // Lock body scroll when panel is open (mobile especially)
  useEffect(() => {
    const isOpen = selectedBookingId || selectedRequestId
    if (isOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [selectedBookingId, selectedRequestId])

  const isPanelOpen = !!(selectedBookingId || selectedRequestId)

  return (
    <div>
      {/* ─── Header ─── */}
      <div className="mb-6 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-3xl mb-1"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
          >
            House
          </h1>
          <p
            className="text-sm fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            {monthLabel}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isAdmin && (
            <Link href="/bookings/new" className="fg-btn-gold text-xs"
              style={{ width: 'auto', padding: '8px 14px' }}>
              + Request a stay
            </Link>
          )}
          {isAdmin && (
            <Link href="/house/new-booking" className="fg-btn-gold text-xs"
              style={{ width: 'auto', padding: '8px 14px' }}>
              + New booking
            </Link>
          )}
        </div>
      </div>

      {savedMessage && (
        <div className="fg-msg-success mb-4">{savedMessage}</div>
      )}
      {errorMessage && (
        <div className="fg-msg-error mb-4">{errorMessage}</div>
      )}

      {/* ─── Status strip — admin only ─── */}
      {isAdmin && (
        <StatusStrip
          stayingTonight={statusCounts.stayingTonight}
          arrivingTomorrow={statusCounts.arrivingTomorrow}
          pendingCount={statusCounts.pendingCount}
          needsBedsCount={statusCounts.needsBedsCount}
          cotsNeededThisMonth={statusCounts.cotsNeededThisMonth}
        />
      )}

      {/* ─── Pending strip — admin only ─── */}
      {isAdmin && pendingVisible.length > 0 && (
        <PendingStrip
          requests={pendingVisible}
          onTap={handleRequestTap}
        />
      )}

      {/* ─── Approved-but-unassigned strip — admin only ─── */}
      {isAdmin && approvedUnassigned.length > 0 && (
        <ApprovedUnassignedStrip
          requests={approvedUnassigned}
          onTap={handleRequestTap}
        />
      )}

      {/* ─── Month navigation ─── */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Link
          href={`/house?start=${prevStart}`}
          className="fg-btn-ghost text-xs"
          style={{ width: 'auto', padding: '6px 12px' }}
        >
          ← Previous month
        </Link>
        {startISO !== thisMonthStart && (
          <Link
            href={`/house?start=${thisMonthStart}`}
            className="fg-btn-ghost text-xs"
            style={{ width: 'auto', padding: '6px 12px' }}
          >
            This month
          </Link>
        )}
        <Link
          href={`/house?start=${nextStart}`}
          className="fg-btn-ghost text-xs"
          style={{ width: 'auto', padding: '6px 12px' }}
        >
          Next month →
        </Link>
      </div>

      {/* ─── Calendar ─── */}
      <BookingsCalendar
        days={days}
        rooms={rooms.map((r) => ({
          id: r.id,
          name: r.name,
          floor: r.floor,
          is_owner_room: r.is_owner_room,
        }))}
        pending={[]}
        approvedUnassigned={[]}
        bookingsByRoom={calendarBookingsByRoom as any}
        startISO={startISO}
        currentMonthStart={thisMonthStart}
        onBookingTap={isAdmin ? handleBookingTap : undefined}
        hideRequestLanes
      />

      {/* ─── Slide-over panel ─── */}
      {isPanelOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fg-panel-backdrop"
            onClick={closePanel}
            aria-hidden
          />
          {/* Panel */}
          <BookingPanel
            profile={profile}
            booking={selectedBooking}
            request={selectedRequest}
            rooms={rooms}
            allBookingsForRequest={visibleBookings.filter(
              (b) => b.request_id && b.request_id === selectedRequest?.id
            )}
            allOverlappingBookings={visibleBookings.filter(
              (b) =>
                selectedRequest &&
                b.request_id !== selectedRequest.id &&
                b.check_in < selectedRequest.check_out &&
                b.check_out > selectedRequest.check_in
            )}
            childrenForRequest={
              selectedRequest
                ? allChildren.filter((c) => c.request_id === selectedRequest.id)
                : []
            }
            templates={templates}
            checksForRequest={
              selectedRequest
                ? checks.filter((c) => c.booking_request_id === selectedRequest.id)
                : []
            }
            requesterNotes={
              selectedRequest && requesterGuestNotesById[selectedRequest.requested_by]
                ? requesterGuestNotesById[selectedRequest.requested_by]
                : null
            }
            bookingGuests={
              selectedRequest ? guestsByRequest[selectedRequest.id] ?? [] : []
            }
            allGuestsForPicker={allGuestsForPicker}
            linkableProfilesForPicker={linkableProfilesForPicker}
            onClose={closePanel}
          />
        </>
      )}
    </div>
  )
}

// ───────── status strip ─────────
function StatusStrip({
  stayingTonight,
  arrivingTomorrow,
  pendingCount,
  needsBedsCount,
  cotsNeededThisMonth,
}: {
  stayingTonight: number
  arrivingTomorrow: number
  pendingCount: number
  needsBedsCount: number
  cotsNeededThisMonth: number
}) {
  const chips: { label: string; count: number; tone: 'neutral' | 'amber' | 'red' | 'blue' }[] = [
    { label: 'staying tonight',   count: stayingTonight,        tone: 'blue' },
    { label: 'arriving tomorrow', count: arrivingTomorrow,      tone: 'neutral' },
    { label: 'pending review',    count: pendingCount,          tone: pendingCount > 0 ? 'amber' : 'neutral' },
    { label: 'needs bed setup',   count: needsBedsCount,        tone: needsBedsCount > 0 ? 'red' : 'neutral' },
    { label: 'cots this month',   count: cotsNeededThisMonth,   tone: 'neutral' },
  ]
  return (
    <div className="fg-status-strip mb-4">
      {chips.map((c) => (
        <div
          key={c.label}
          className={`fg-status-chip fg-status-chip-${c.tone}`}
        >
          <span className="fg-status-chip-count">{c.count}</span>
          <span className="fg-status-chip-label">{c.label}</span>
        </div>
      ))}
    </div>
  )
}

// ───────── pending requests strip ─────────
function PendingStrip({
  requests,
  onTap,
}: {
  requests: Request[]
  onTap: (id: string) => void
}) {
  return (
    <section className="fg-card p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="fg-section-label" style={{ marginBottom: 0 }}>
          Pending review ({requests.length})
        </h2>
      </div>
      <div className="space-y-2">
        {requests.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onTap(r.id)}
            className="fg-pending-card"
          >
            <div className="flex-1 min-w-0">
              <div
                className="text-sm"
                style={{
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--color-ink)',
                }}
              >
                {r.profiles?.full_name ?? 'Unknown'}
              </div>
              <div
                className="text-xs fg-mono"
                style={{ color: 'var(--color-muted)' }}
              >
                {formatDateRange(r.check_in, r.check_out)} · {r.adults}+{r.children}
              </div>
            </div>
            <span className="fg-pill fg-pill-amber text-xs shrink-0">
              Review →
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ───────── approved-unassigned strip ─────────
function ApprovedUnassignedStrip({
  requests,
  onTap,
}: {
  requests: Request[]
  onTap: (id: string) => void
}) {
  return (
    <section className="fg-card p-4 mb-4"
      style={{ borderLeft: '3px solid var(--color-red)' }}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="fg-section-label" style={{ marginBottom: 0 }}>
          Needs bed setup ({requests.length})
        </h2>
      </div>
      <div className="space-y-2">
        {requests.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onTap(r.id)}
            className="fg-pending-card"
          >
            <div className="flex-1 min-w-0">
              <div
                className="text-sm"
                style={{
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--color-ink)',
                }}
              >
                {r.profiles?.full_name ?? 'Unknown'}
              </div>
              <div
                className="text-xs fg-mono"
                style={{ color: 'var(--color-muted)' }}
              >
                {formatDateRange(r.check_in, r.check_out)} · {r.adults}+{r.children}
              </div>
            </div>
            <span className="fg-pill fg-pill-red text-xs shrink-0">
              Assign →
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

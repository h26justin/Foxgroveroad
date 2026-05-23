'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatDateRange, nightsBetween } from '@/lib/dates'
import { floorLabel } from '@/lib/floors'
import {
  approveRequest,
  declineRequest,
  cancelApprovedBooking,
  editRequestDates,
  deleteBookingPermanently,
  movePillToBed,
  addGuestToFirstAvailableBed,
  renameGuest,
  removeGuest,
  togglePrearrivalCheck,
  assignCanonicalGuestToBed,
  addGuestToBookingList,
  removeGuestFromBookingList,
  restoreGuestToBookingList,
} from './actions'
import Toast from '../_toast'

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

const AGE_LABEL: Record<ChildRow['age_band'], string> = {
  infant: 'Infant',
  toddler: 'Toddler',
  child: 'Child',
}
const SLEEP_LABEL: Record<ChildRow['sleep_arrangement'], string> = {
  cot: 'Cot (guest brings)',
  own_bed: 'Own bed',
  sharing_with_parent: 'Sharing with parent',
}

export default function BookingPanel({
  profile,
  booking,
  request,
  rooms,
  allBookingsForRequest,
  allOverlappingBookings,
  childrenForRequest,
  templates,
  checksForRequest,
  requesterNotes,
  bookingGuests,
  allGuestsForPicker,
  linkableProfilesForPicker,
  onClose,
}: {
  profile: Profile
  booking: Booking | null
  request: Request | null
  rooms: Room[]
  allBookingsForRequest: Booking[]
  allOverlappingBookings: Booking[]
  childrenForRequest: ChildRow[]
  templates: Template[]
  checksForRequest: Check[]
  requesterNotes: {
    guest_id: string
    full_name: string
    dietary_notes: string | null
    allergies: string | null
    room_preference: string | null
    things_they_bring: string | null
    general_notes: string | null
  } | null
  bookingGuests: {
    guest_id: string
    full_name: string
    linked_profile_id: string | null
    position: number
  }[]
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
  onClose: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [localError, setLocalError] = useState<string | null>(null)
  const [declineMode, setDeclineMode] = useState(false)
  const [declineReason, setDeclineReason] = useState('')

  // v15: edit-dates inline form
  const [editDatesMode, setEditDatesMode] = useState(false)
  const [newCheckIn, setNewCheckIn] = useState('')
  const [newCheckOut, setNewCheckOut] = useState('')

  // v22: bed-picker state (when admin clicks "Assign bed" on a guest)
  const [assigningGuestId, setAssigningGuestId] = useState<string | null>(null)

  // v22: "+ Add guest to booking" inline form
  const [addGuestMode, setAddGuestMode] = useState<'closed' | 'pick' | 'new'>(
    'closed',
  )
  const [pickGuestId, setPickGuestId] = useState('')
  const [newGuestName, setNewGuestName] = useState('')
  const [newGuestLinkProfileId, setNewGuestLinkProfileId] = useState('')
  // v43: optional room to auto-assign the guest to in the same submit.
  // '' means "don't auto-assign" — admin can still pick a bed by hand
  // afterwards via the Assign bed button.
  const [addGuestRoomId, setAddGuestRoomId] = useState('')

  // v43: toast for undo-able actions (currently: guest remove). Patterned
  // after the housekeeping page's tick+undo flow.
  const [toast, setToast] = useState<{
    message: string
    undo?: () => void
  } | null>(null)

  // Auto-clear error
  useEffect(() => {
    if (!localError) return
    const t = setTimeout(() => setLocalError(null), 5000)
    return () => clearTimeout(t)
  }, [localError])

  // Close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The "primary" booking is the request, if there is one. If only a
  // booking was clicked (no request), still show what we can.
  const primaryRequest = request
  const isPending = primaryRequest?.status === 'pending'
  const isApproved = primaryRequest?.status === 'approved'
  const isCancelled = primaryRequest?.status === 'cancelled'
  const isDeclined = primaryRequest?.status === 'declined'
  const isTerminal = isCancelled || isDeclined
  const isAdmin = profile.role === 'admin'

  // Bed-state map for the bed grid (only meaningful when we have a request)
  const cotsNeeded = childrenForRequest.filter(
    (c) => c.sleep_arrangement === 'cot'
  ).length

  // Build map of bed → occupant name, for blocking other-booking beds
  const blockedBedOccupant = new Map<string, string>()
  for (const o of allOverlappingBookings) {
    if (!o.bed_id) continue
    const name = o.guest_name || o.profiles?.full_name || 'Another guest'
    if (!blockedBedOccupant.has(o.bed_id)) {
      blockedBedOccupant.set(o.bed_id, name)
    }
  }

  // Pill drag state (simpler than bedrooms/BedroomOrganiser since we're
  // always inside the panel)
  const [drag, setDrag] = useState<{
    bookingId: string
    name: string
    offsetX: number
    offsetY: number
    x: number
    y: number
  } | null>(null)
  const [hoveredBedId, setHoveredBedId] = useState<string | null>(null)

  function handlePillPointerDown(
    e: React.PointerEvent,
    bookingId: string,
    name: string
  ) {
    if (!isAdmin) return
    e.preventDefault()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({
      bookingId,
      name,
      offsetX: e.clientX - r.left,
      offsetY: e.clientY - r.top,
      x: e.clientX,
      y: e.clientY,
    })
  }

  function handlePillPointerMove(e: React.PointerEvent) {
    if (!drag) return
    e.preventDefault()
    setDrag((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev))
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const bedEl = el?.closest('[data-panel-bed-id]') as HTMLElement | null
    const bedId = bedEl?.dataset.panelBedId ?? null
    if (bedId && blockedBedOccupant.has(bedId)) {
      setHoveredBedId(null)
    } else {
      setHoveredBedId(bedId)
    }
  }

  function handlePillPointerUp(e: React.PointerEvent) {
    if (!drag) return
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const droppedBedId = hoveredBedId
    const droppedBookingId = drag.bookingId
    setDrag(null)
    setHoveredBedId(null)
    if (!droppedBedId) return

    // No-op if same bed
    const cur = allBookingsForRequest.find((b) => b.id === droppedBookingId)
    if (!cur || cur.bed_id === droppedBedId) return

    if (blockedBedOccupant.has(droppedBedId)) {
      setLocalError(
        `That bed is already taken by ${blockedBedOccupant.get(droppedBedId)}.`
      )
      return
    }

    startTransition(async () => {
      const r = await movePillToBed(droppedBookingId, droppedBedId)
      if (r?.error) {
        setLocalError(r.error)
        return
      }
      router.refresh()
    })
  }

  function handleAddGuest() {
    if (!primaryRequest) return
    const name = window.prompt('Guest name')
    if (!name?.trim()) return
    startTransition(async () => {
      const r = await addGuestToFirstAvailableBed(primaryRequest.id, name.trim())
      if (r?.error) {
        setLocalError(r.error)
        return
      }
      router.refresh()
    })
  }

  // v22: assign a canonical guest to a specific bed
  function handleAssignGuestToBed(guestId: string, bedId: string) {
    if (!primaryRequest) return
    setAssigningGuestId(null)
    startTransition(async () => {
      const r = await assignCanonicalGuestToBed(primaryRequest.id, guestId, bedId)
      if (r?.error) {
        setLocalError(r.error)
        return
      }
      router.refresh()
    })
  }

  // v22: add a saved guest to this booking's guest list. v43: optionally
  // also assign them to a room in the same submit.
  function handleAddSavedGuestToBooking() {
    if (!primaryRequest || !pickGuestId) return
    const fd = new FormData()
    fd.append('request_id', primaryRequest.id)
    fd.append('guest_id', pickGuestId)
    if (addGuestRoomId) fd.append('room_id', addGuestRoomId)
    setAddGuestMode('closed')
    setPickGuestId('')
    setAddGuestRoomId('')
    startTransition(async () => {
      const r = await addGuestToBookingList(fd)
      if (r?.error) {
        setLocalError(r.error)
        return
      }
      if (r?.warning) {
        // Guest added but room was full — surface as a soft notice
        setLocalError(r.warning)
      }
      router.refresh()
    })
  }

  // v22: add a new (typed) guest to this booking, auto-creating the
  // guest record + optionally linking to an account. v43: optionally
  // also assign them to a room in the same submit.
  function handleAddNewGuestToBooking() {
    if (!primaryRequest || !newGuestName.trim()) return
    const fd = new FormData()
    fd.append('request_id', primaryRequest.id)
    fd.append('full_name', newGuestName.trim())
    if (newGuestLinkProfileId) {
      fd.append('link_profile_id', newGuestLinkProfileId)
    }
    if (addGuestRoomId) fd.append('room_id', addGuestRoomId)
    setAddGuestMode('closed')
    setNewGuestName('')
    setNewGuestLinkProfileId('')
    setAddGuestRoomId('')
    startTransition(async () => {
      const r = await addGuestToBookingList(fd)
      if (r?.error) {
        setLocalError(r.error)
        return
      }
      if (r?.warning) {
        setLocalError(r.warning)
      }
      router.refresh()
    })
  }

  // v22 + v43: remove a canonical guest from this booking. No confirm
  // dialog — instead we show a toast with Undo that restores the join
  // entry (bed assignment is lost on remove and cannot be restored
  // automatically; toast text warns about that).
  function handleRemoveGuestFromBooking(guestId: string, name: string) {
    if (!primaryRequest) return
    const requestId = primaryRequest.id
    startTransition(async () => {
      const r = await removeGuestFromBookingList(requestId, guestId)
      if (r?.error) {
        setLocalError(r.error)
        return
      }
      setToast({
        message: `Removed ${name}`,
        undo: () => {
          setToast(null)
          startTransition(async () => {
            const restoreRes = await restoreGuestToBookingList(
              requestId,
              guestId,
            )
            if (restoreRes?.error) {
              setLocalError(restoreRes.error)
              return
            }
            setToast({
              message: `Restored ${name}. Bed wasn't reassigned — pick one if needed.`,
            })
            router.refresh()
          })
        },
      })
      router.refresh()
    })
  }

  function handleRename(bookingId: string, currentName: string) {
    const next = window.prompt('Rename guest', currentName)
    if (next == null) return
    if (!next.trim() || next.trim() === currentName) return
    startTransition(async () => {
      const r = await renameGuest(bookingId, next.trim())
      if (r?.error) {
        setLocalError(r.error)
        return
      }
      router.refresh()
    })
  }

  function handleRemove(bookingId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this booking?`)) return
    startTransition(async () => {
      const r = await removeGuest(bookingId)
      if (r?.error) {
        setLocalError(r.error)
        return
      }
      router.refresh()
    })
  }

  function handleToggleCheck(
    templateId: string,
    roomId: string,
    isChecked: boolean
  ) {
    if (!primaryRequest) return
    startTransition(async () => {
      const r = await togglePrearrivalCheck(
        primaryRequest.id,
        templateId,
        roomId,
        !isChecked
      )
      if (r?.error) {
        setLocalError(r.error)
        return
      }
      router.refresh()
    })
  }

  function handleCancelBooking() {
    if (!primaryRequest) return
    if (
      !window.confirm(
        'Cancel this booking? Guests will be removed and the dates freed up.'
      )
    )
      return
    startTransition(async () => {
      const r = await cancelApprovedBooking(primaryRequest.id)
      if (r?.error) {
        setLocalError(r.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  function handleStartEditDates() {
    if (!primaryRequest) return
    setNewCheckIn(primaryRequest.check_in)
    setNewCheckOut(primaryRequest.check_out)
    setEditDatesMode(true)
    setLocalError(null)
  }

  async function handleSaveDates() {
    if (!primaryRequest) return
    setLocalError(null)
    if (!newCheckIn || !newCheckOut) {
      setLocalError('Pick both dates')
      return
    }
    if (newCheckIn >= newCheckOut) {
      setLocalError('Check-out must be after check-in')
      return
    }
    startTransition(async () => {
      const r = await editRequestDates(
        primaryRequest.id,
        newCheckIn,
        newCheckOut
      )
      if (r?.error) {
        setLocalError(r.error)
        return
      }
      setEditDatesMode(false)
      router.refresh()
    })
  }

  function handleDeletePermanently() {
    if (!primaryRequest) return
    if (
      !window.confirm(
        'Permanently delete this booking? This cannot be undone — all history will be lost.'
      )
    )
      return
    startTransition(async () => {
      const r = await deleteBookingPermanently(primaryRequest.id)
      if (r?.error) {
        setLocalError(r.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  // ── Render ───────────────────────────────────────────────────────────
  if (!primaryRequest && !booking) {
    return (
      <aside className="fg-panel" role="dialog" aria-label="Booking">
        <PanelHeader
          title="Not found"
          subtitle=""
          status={null}
          onClose={onClose}
        />
        <div className="p-5">
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            This booking is no longer in the visible window. Try navigating to
            the month it's in.
          </p>
        </div>
      </aside>
    )
  }

  // Header name resolution:
  //   - If a specific bed booking is open (user tapped a calendar bar),
  //     show the guest in THAT bed first, falling back to the booking's
  //     guest_name, then to the requester (legacy paths).
  //   - If only a request is open (user tapped a strip item), show the
  //     requester's name — there's no specific bed/guest to highlight.
  const guestName = booking
    ? booking.guest_name ??
      booking.profiles?.full_name ??
      primaryRequest?.profiles?.full_name ??
      'Unknown'
    : primaryRequest?.profiles?.full_name ?? 'Unknown'
  const dates = primaryRequest
    ? formatDateRange(primaryRequest.check_in, primaryRequest.check_out)
    : booking
      ? formatDateRange(booking.check_in, booking.check_out)
      : ''
  const nights = primaryRequest
    ? nightsBetween(primaryRequest.check_in, primaryRequest.check_out)
    : booking
      ? nightsBetween(booking.check_in, booking.check_out)
      : 0

  const adultsLine = primaryRequest
    ? primaryRequest.adults === 1
      ? '1 adult'
      : primaryRequest.adults_sharing === false
        ? `${primaryRequest.adults} adults · separate beds`
        : `${primaryRequest.adults} adults · sharing`
    : null

  // Cot warning logic
  const occupiedRoomIds = new Set<string>()
  for (const b of allBookingsForRequest) {
    if (b.beds?.room_id) occupiedRoomIds.add(b.beds.room_id)
  }
  const cotCapableOccupied = rooms.filter(
    (r) => occupiedRoomIds.has(r.id) && r.can_fit_cot !== false
  ).length
  const cotShortfall = Math.max(0, cotsNeeded - cotCapableOccupied)

  const totalSlots = primaryRequest
    ? primaryRequest.adults + primaryRequest.children
    : 0
  const assignedCount = allBookingsForRequest.length

  // For pre-arrival checklist: only show templates for occupied rooms
  const templatesByRoom = new Map<string, Template[]>()
  for (const t of templates) {
    if (!occupiedRoomIds.has(t.room_id)) continue
    if (!templatesByRoom.has(t.room_id)) templatesByRoom.set(t.room_id, [])
    templatesByRoom.get(t.room_id)!.push(t)
  }
  const checksByTemplate = new Map<string, Check>()
  for (const c of checksForRequest) checksByTemplate.set(c.template_id, c)

  // Bookings indexed by bed for the bed grid
  const bookingsByBed = new Map<string, Booking[]>()
  for (const b of allBookingsForRequest) {
    if (!bookingsByBed.has(b.bed_id)) bookingsByBed.set(b.bed_id, [])
    bookingsByBed.get(b.bed_id)!.push(b)
  }

  // v22: where each canonical guest is currently assigned (if anywhere).
  // Built from allBookingsForRequest by guest_id. Used to render the
  // "On this booking" guest list with assignment status.
  const bedByCanonicalGuest = new Map<
    string,
    { bed_id: string; bed_label: string; room_name: string; booking_id: string }
  >()
  // Build a quick lookup from bed_id → bed/room labels
  const bedLabelsById = new Map<
    string,
    { bed_label: string; room_name: string }
  >()
  for (const r of rooms) {
    for (const b of r.beds ?? []) {
      bedLabelsById.set(b.id, { bed_label: b.name, room_name: r.name })
    }
  }
  for (const b of allBookingsForRequest) {
    if (!b.guest_id) continue
    const labels = bedLabelsById.get(b.bed_id)
    bedByCanonicalGuest.set(b.guest_id, {
      bed_id: b.bed_id,
      bed_label: labels?.bed_label ?? '?',
      room_name: labels?.room_name ?? '?',
      booking_id: b.id,
    })
  }

  // List of guests on this booking who haven't yet been assigned to a bed
  const unassignedBookingGuests = bookingGuests.filter(
    (g) => !bedByCanonicalGuest.has(g.guest_id),
  )

  // Group rooms by floor for the bed grid
  const guestRooms = rooms.filter(
    (r) => !r.is_owner_room && r.room_type === 'bedroom'
  )
  const floorOrder = Array.from(new Set(guestRooms.map((r) => r.floor))).sort(
    (a, b) => b - a
  )
  const roomsByFloor = new Map<number, Room[]>()
  for (const r of guestRooms) {
    if (!roomsByFloor.has(r.floor)) roomsByFloor.set(r.floor, [])
    roomsByFloor.get(r.floor)!.push(r)
  }

  return (
    <aside
      className="fg-panel"
      role="dialog"
      aria-label={`Booking — ${guestName}`}
    >
      <PanelHeader
        title={guestName}
        subtitle={`${dates} · ${nights} night${nights === 1 ? '' : 's'}`}
        status={primaryRequest?.status ?? booking?.status ?? null}
        onClose={onClose}
      />

      <div className="fg-panel-scroll">
        {localError && <div className="fg-msg-error mb-4">{localError}</div>}

        {/* ── Action buttons ── */}
        {isAdmin && primaryRequest && (
          <div className="fg-panel-section">
            {isPending && !declineMode && (
              <div className="flex gap-2 flex-wrap">
                <form action={approveRequest} className="flex-1">
                  <input type="hidden" name="id" value={primaryRequest.id} />
                  <button type="submit" className="fg-btn-primary w-full">
                    Approve
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setDeclineMode(true)}
                  className="fg-btn-ghost"
                  style={{ width: 'auto', padding: '10px 14px' }}
                >
                  Decline…
                </button>
              </div>
            )}
            {isPending && declineMode && (
              <form action={declineRequest} className="space-y-2">
                <input type="hidden" name="id" value={primaryRequest.id} />
                <label className="fg-label">
                  Reason (optional, shared with the requester)
                </label>
                <textarea
                  name="reason"
                  rows={2}
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="fg-input"
                  placeholder="e.g. Too short notice. Try again next week?"
                  maxLength={300}
                />
                <div className="flex gap-2">
                  <button type="submit" className="fg-btn-primary flex-1">
                    Confirm decline
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeclineMode(false)
                      setDeclineReason('')
                    }}
                    className="fg-btn-ghost"
                    style={{ width: 'auto', padding: '10px 14px' }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {isApproved && !editDatesMode && (
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleStartEditDates}
                  className="fg-btn-ghost text-xs"
                  style={{ width: 'auto', padding: '8px 14px' }}
                >
                  Edit dates
                </button>
                <button
                  type="button"
                  onClick={handleCancelBooking}
                  className="fg-btn-ghost text-xs"
                  style={{
                    width: 'auto',
                    padding: '8px 14px',
                    color: 'var(--color-red)',
                  }}
                >
                  Cancel booking
                </button>
              </div>
            )}
            {isApproved && editDatesMode && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="fg-label">Check-in</label>
                    <input
                      type="date"
                      value={newCheckIn}
                      onChange={(e) => setNewCheckIn(e.target.value)}
                      className="fg-input"
                    />
                  </div>
                  <div>
                    <label className="fg-label">Check-out</label>
                    <input
                      type="date"
                      value={newCheckOut}
                      onChange={(e) => setNewCheckOut(e.target.value)}
                      className="fg-input"
                    />
                  </div>
                </div>
                <p className="text-xs fg-mono" style={{ color: 'var(--color-muted)' }}>
                  Bed assignments stay the same — only the dates change.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveDates}
                    className="fg-btn-primary"
                    style={{ width: 'auto', padding: '8px 16px' }}
                  >
                    Save new dates
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditDatesMode(false)
                      setLocalError(null)
                    }}
                    className="fg-btn-ghost"
                    style={{ width: 'auto', padding: '8px 14px' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {isTerminal && (
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleDeletePermanently}
                  className="fg-btn-ghost text-xs"
                  style={{
                    width: 'auto',
                    padding: '8px 14px',
                    color: 'var(--color-red)',
                  }}
                >
                  Delete entirely
                </button>
                <span
                  className="text-xs fg-mono"
                  style={{
                    color: 'var(--color-muted)',
                    alignSelf: 'center',
                  }}
                >
                  Removes the booking and its history. Cannot be undone.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Profile notes (admin only) ── */}
        {isAdmin && primaryRequest && requesterNotes && hasAnyNotes(requesterNotes) && (
          <div className="fg-panel-section">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="fg-section-label" style={{ marginBottom: 0 }}>
                About {primaryRequest.profiles?.full_name ?? 'this guest'}
              </h3>
              <a
                href={`/admin/guests/${requesterNotes.guest_id}`}
                className="text-xs fg-mono"
                style={{
                  color: 'var(--color-blue)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                Edit guest →
              </a>
            </div>
            <div className="space-y-2">
              {requesterNotes.allergies && (
                <NoteRow
                  icon="⚠"
                  label="Allergies"
                  text={requesterNotes.allergies}
                  emphasis
                />
              )}
              {requesterNotes.dietary_notes && (
                <NoteRow
                  icon="🍴"
                  label="Dietary"
                  text={requesterNotes.dietary_notes}
                />
              )}
              {requesterNotes.room_preference && (
                <NoteRow
                  icon="🛏"
                  label="Room"
                  text={requesterNotes.room_preference}
                />
              )}
              {requesterNotes.things_they_bring && (
                <NoteRow
                  icon="🎒"
                  label="Brings"
                  text={requesterNotes.things_they_bring}
                />
              )}
              {requesterNotes.general_notes && (
                <NoteRow
                  icon="💭"
                  label="Notes"
                  text={requesterNotes.general_notes}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Group makeup ── */}
        {primaryRequest && adultsLine && (
          <div className="fg-panel-section">
            <h3 className="fg-section-label mb-2">Group</h3>
            <div className="text-sm" style={{ color: 'var(--color-ink)' }}>
              {adultsLine}
            </div>

            {childrenForRequest.length > 0 && (
              <ul className="mt-2 space-y-1">
                {childrenForRequest.map((c, i) => (
                  <li
                    key={c.id}
                    className="text-xs fg-mono"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    Child {i + 1}: {AGE_LABEL[c.age_band]} ·{' '}
                    {SLEEP_LABEL[c.sleep_arrangement]}
                  </li>
                ))}
              </ul>
            )}

            {cotsNeeded > 0 && cotShortfall > 0 && (
              <div
                className="text-xs fg-mono mt-3 p-2 rounded"
                style={{
                  background: 'rgba(181, 114, 10, 0.08)',
                  color: 'var(--color-amber)',
                }}
              >
                ⚠ {cotsNeeded} cot{cotsNeeded === 1 ? '' : 's'} needed but only{' '}
                {cotCapableOccupied} cot-capable room
                {cotCapableOccupied === 1 ? '' : 's'} assigned. Move a guest to
                a cot-capable room.
              </div>
            )}

            {primaryRequest.notes && (
              <div
                className="text-sm mt-3 px-3 py-2 rounded"
                style={{
                  background: 'var(--color-cream)',
                  color: 'var(--color-ink)',
                }}
              >
                💬 {primaryRequest.notes}
              </div>
            )}
          </div>
        )}

        {/* ── On this booking (v22) ── */}
        {isAdmin && isApproved && primaryRequest && (
          <div className="fg-panel-section">
            <div className="flex items-center justify-between mb-2">
              <h3 className="fg-section-label" style={{ marginBottom: 0 }}>
                On this booking ({bookingGuests.length} guest
                {bookingGuests.length === 1 ? '' : 's'})
              </h3>
              {addGuestMode === 'closed' && (
                <button
                  type="button"
                  onClick={() => setAddGuestMode('pick')}
                  className="fg-btn-gold text-xs"
                  style={{ width: 'auto', padding: '6px 10px' }}
                >
                  + Add guest
                </button>
              )}
            </div>

            {bookingGuests.length === 0 ? (
              <p
                className="text-xs fg-mono mb-3"
                style={{ color: 'var(--color-muted)' }}
              >
                No canonical guests attached yet. The bed pills below
                still work — you can add legacy guests via the bed
                assignments grid. To use the new flow, click &ldquo;+
                Add guest&rdquo;.
              </p>
            ) : (
              <p
                className="text-xs fg-mono mb-3"
                style={{ color: 'var(--color-muted)' }}
              >
                Click &ldquo;Assign bed&rdquo; on an unassigned guest
                to put them somewhere. × removes them from the booking.
              </p>
            )}

            {/* Inline form for + Add guest */}
            {addGuestMode !== 'closed' && (
              <div
                className="mb-3 p-3"
                style={{
                  border: '1px solid var(--color-warm)',
                  borderRadius: 8,
                  background: 'var(--color-cream)',
                }}
              >
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setAddGuestMode('pick')}
                    className={
                      addGuestMode === 'pick' ? 'fg-btn-gold' : 'fg-btn-ghost'
                    }
                    style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
                  >
                    Pick saved
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddGuestMode('new')}
                    className={
                      addGuestMode === 'new' ? 'fg-btn-gold' : 'fg-btn-ghost'
                    }
                    style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
                  >
                    + New guest
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddGuestMode('closed')
                      setPickGuestId('')
                      setNewGuestName('')
                      setNewGuestLinkProfileId('')
                    }}
                    className="fg-btn-ghost"
                    style={{
                      width: 'auto',
                      padding: '4px 10px',
                      fontSize: 12,
                      marginLeft: 'auto',
                    }}
                  >
                    Cancel
                  </button>
                </div>

                {addGuestMode === 'pick' && (
                  <>
                    <select
                      value={pickGuestId}
                      onChange={(e) => setPickGuestId(e.target.value)}
                      className="fg-input"
                      style={{ fontSize: 13, marginBottom: 8 }}
                    >
                      <option value="">— pick a saved guest —</option>
                      {allGuestsForPicker
                        .filter(
                          (g) =>
                            !bookingGuests.some((bg) => bg.guest_id === g.id),
                        )
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.full_name}
                            {g.linked ? ` (${g.role})` : ''}
                          </option>
                        ))}
                    </select>
                    <RoomPicker
                      rooms={rooms}
                      value={addGuestRoomId}
                      onChange={setAddGuestRoomId}
                    />
                    <button
                      type="button"
                      onClick={handleAddSavedGuestToBooking}
                      disabled={!pickGuestId}
                      className="fg-btn-gold text-xs mt-2"
                      style={{ width: 'auto', padding: '6px 14px' }}
                    >
                      {addGuestRoomId ? 'Add & assign' : 'Add to booking'}
                    </button>
                  </>
                )}

                {addGuestMode === 'new' && (
                  <>
                    <input
                      type="text"
                      value={newGuestName}
                      onChange={(e) => setNewGuestName(e.target.value)}
                      placeholder="Guest's full name"
                      maxLength={200}
                      className="fg-input"
                      style={{ fontSize: 13, marginBottom: 8 }}
                    />
                    {linkableProfilesForPicker.length > 0 && (
                      <select
                        value={newGuestLinkProfileId}
                        onChange={(e) =>
                          setNewGuestLinkProfileId(e.target.value)
                        }
                        className="fg-input"
                        style={{ fontSize: 13, marginBottom: 8 }}
                      >
                        <option value="">
                          — link to account (optional) —
                        </option>
                        {linkableProfilesForPicker.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name} ({p.role})
                          </option>
                        ))}
                      </select>
                    )}
                    <RoomPicker
                      rooms={rooms}
                      value={addGuestRoomId}
                      onChange={setAddGuestRoomId}
                    />
                    <button
                      type="button"
                      onClick={handleAddNewGuestToBooking}
                      disabled={!newGuestName.trim()}
                      className="fg-btn-gold text-xs mt-2"
                      style={{ width: 'auto', padding: '6px 14px' }}
                    >
                      {addGuestRoomId ? 'Create, add & assign' : 'Create & add'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Guest list */}
            {bookingGuests.length > 0 && (
              <div className="space-y-2">
                {bookingGuests.map((g) => {
                  const bed = bedByCanonicalGuest.get(g.guest_id)
                  const isAssigning = assigningGuestId === g.guest_id
                  return (
                    <div
                      key={g.guest_id}
                      className="p-3"
                      style={{
                        border: '1px solid var(--color-warm)',
                        borderRadius: 8,
                        background: 'var(--color-cream)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div
                          className="text-sm"
                          style={{
                            fontFamily: 'var(--font-serif)',
                            color: 'var(--color-ink)',
                          }}
                        >
                          {g.full_name}
                        </div>
                        <div className="flex items-center gap-2">
                          {bed ? (
                            <span
                              className="text-xs fg-mono"
                              style={{ color: 'var(--color-muted)' }}
                            >
                              ✓ {bed.room_name} · {bed.bed_label}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setAssigningGuestId(
                                  isAssigning ? null : g.guest_id,
                                )
                              }
                              className="fg-btn-ghost text-xs"
                              style={{
                                width: 'auto',
                                padding: '4px 10px',
                                color: 'var(--color-amber)',
                              }}
                            >
                              {isAssigning ? 'Cancel' : 'Assign bed'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveGuestFromBooking(
                                g.guest_id,
                                g.full_name,
                              )
                            }
                            aria-label="Remove from booking"
                            className="fg-mono"
                            style={{
                              background: 'transparent',
                              color: 'var(--color-red)',
                              border: 'none',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              fontSize: 14,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      {/* Bed picker for this guest */}
                      {isAssigning && !bed && (
                        <div className="mt-3">
                          <p
                            className="text-xs fg-mono mb-2"
                            style={{ color: 'var(--color-muted)' }}
                          >
                            Tap a bed to assign {g.full_name}:
                          </p>
                          <div className="space-y-2">
                            {floorOrder.map((floor) => (
                              <div key={floor}>
                                <div
                                  className="text-[10px] fg-mono mb-1"
                                  style={{ color: 'var(--color-muted)' }}
                                >
                                  {floorLabel(floor)}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {(roomsByFloor.get(floor) ?? []).flatMap(
                                    (room) =>
                                      room.beds.map((bedOpt) => {
                                        const sameBookingPills =
                                          bookingsByBed.get(bedOpt.id) ?? []
                                        const occupiedByOther =
                                          allOverlappingBookings.some(
                                            (ob) => ob.bed_id === bedOpt.id,
                                          )
                                        // Only cross-booking conflicts hard-block.
                                        // Same-booking sharing is allowed (couples, etc).
                                        const disabled = occupiedByOther
                                        const sharingWith =
                                          sameBookingPills.length > 0
                                            ? sameBookingPills
                                                .map((p) => p.guest_name ?? 'Guest')
                                                .join(', ')
                                            : null
                                        const isSingle =
                                          bedOpt.bed_type === 'single' ||
                                          bedOpt.bed_type === 'cot'

                                        function onClickAssign() {
                                          // Soft warning if trying to share a Single
                                          if (
                                            sameBookingPills.length > 0 &&
                                            isSingle
                                          ) {
                                            const ok = window.confirm(
                                              `${bedOpt.name} is a single bed and ${sharingWith} is already assigned. Share anyway?`,
                                            )
                                            if (!ok) return
                                          }
                                          handleAssignGuestToBed(
                                            g.guest_id,
                                            bedOpt.id,
                                          )
                                        }

                                        return (
                                          <button
                                            key={bedOpt.id}
                                            type="button"
                                            disabled={disabled}
                                            onClick={onClickAssign}
                                            className="text-xs fg-mono"
                                            style={{
                                              padding: '4px 8px',
                                              border:
                                                '1px solid var(--color-warm)',
                                              borderRadius: 6,
                                              background: disabled
                                                ? 'var(--color-warm)'
                                                : sharingWith
                                                  ? '#fff8e6'
                                                  : 'white',
                                              color: disabled
                                                ? 'var(--color-muted)'
                                                : 'var(--color-ink)',
                                              cursor: disabled
                                                ? 'not-allowed'
                                                : 'pointer',
                                            }}
                                            title={
                                              sharingWith
                                                ? `Currently: ${sharingWith}`
                                                : undefined
                                            }
                                          >
                                            {room.name} · {bedOpt.name}
                                            {sharingWith && (
                                              <span
                                                style={{
                                                  marginLeft: 6,
                                                  color: 'var(--color-amber)',
                                                  fontSize: 10,
                                                }}
                                              >
                                                +share
                                              </span>
                                            )}
                                          </button>
                                        )
                                      }),
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Bed assignments ── */}
        {isAdmin && isApproved && (
          <div className="fg-panel-section">
            <div className="flex items-center justify-between mb-2">
              <h3 className="fg-section-label" style={{ marginBottom: 0 }}>
                Bed assignments ({assignedCount} of {totalSlots || '?'})
              </h3>
              <button
                type="button"
                onClick={handleAddGuest}
                className="fg-btn-ghost text-xs"
                style={{ width: 'auto', padding: '6px 10px' }}
                title="Legacy: add a free-text guest pill direct to an empty bed"
              >
                + Free-text pill
              </button>
            </div>

            <p
              className="text-xs fg-mono mb-3"
              style={{ color: 'var(--color-muted)' }}
            >
              Drag a guest pill onto a bed. Tap to rename, × to remove.
            </p>

            {floorOrder.map((floor) => (
              <div key={floor} className="mb-3">
                <div
                  className="text-[10px] fg-mono mb-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {floorLabel(floor)}
                </div>
                <div className="space-y-2">
                  {(roomsByFloor.get(floor) ?? []).map((r) => (
                    <div key={r.id} className="fg-panel-room">
                      <div className="text-sm mb-2"
                        style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}>
                        🛏 {r.name}
                      </div>
                      <div className="space-y-1">
                        {r.beds.length === 0 ? (
                          <div className="text-xs fg-mono"
                            style={{ color: 'var(--color-muted)' }}>
                            (no beds)
                          </div>
                        ) : (
                          r.beds.map((bed) => {
                            const pills = bookingsByBed.get(bed.id) ?? []
                            const blockedBy = blockedBedOccupant.get(bed.id) ?? null
                            const isBlocked = !!blockedBy
                            const isHovered = hoveredBedId === bed.id
                            return (
                              <div
                                key={bed.id}
                                data-panel-bed-id={bed.id}
                                className={[
                                  'fg-panel-bed',
                                  isBlocked ? 'is-blocked' : '',
                                  isHovered ? 'is-hovered' : '',
                                  drag && !isBlocked ? 'is-dropzone' : '',
                                ].filter(Boolean).join(' ')}
                              >
                                <div className="fg-panel-bed-label">
                                  {bed.name}
                                  <span className="fg-panel-bed-type">
                                    {bed.bed_type}
                                  </span>
                                  {isBlocked && (
                                    <span className="fg-panel-bed-blocked">
                                      {blockedBy}
                                    </span>
                                  )}
                                </div>
                                <div className="fg-panel-bed-pills">
                                  {pills.length === 0 && !isBlocked && (
                                    <span className="fg-panel-bed-empty">empty</span>
                                  )}
                                  {pills.length === 0 && isBlocked && (
                                    <span className="fg-panel-bed-empty"
                                      style={{ fontStyle: 'italic' }}>
                                      booked by another
                                    </span>
                                  )}
                                  {pills.map((p) => (
                                    <PanelPill
                                      key={p.id}
                                      bookingId={p.id}
                                      name={p.guest_name ?? 'Guest'}
                                      onPointerDown={handlePillPointerDown}
                                      onPointerMove={handlePillPointerMove}
                                      onPointerUp={handlePillPointerUp}
                                      onTap={handleRename}
                                      onRemove={handleRemove}
                                    />
                                  ))}
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Pre-arrival checklist ── */}
        {(profile.role === 'admin' || profile.role === 'cleaner') &&
          isApproved &&
          assignedCount > 0 &&
          templatesByRoom.size > 0 && (
            <div className="fg-panel-section">
              <h3 className="fg-section-label mb-2">Pre-arrival checklist</h3>
              <div className="space-y-3">
                {Array.from(templatesByRoom.entries()).map(([roomId, ts]) => {
                  const r = rooms.find((x) => x.id === roomId)
                  const checkedCount = ts.filter((t) => checksByTemplate.has(t.id)).length
                  return (
                    <div key={roomId}>
                      <div className="text-xs fg-mono mb-1"
                        style={{ color: 'var(--color-muted)' }}>
                        {r?.name ?? 'Room'} ({checkedCount}/{ts.length})
                      </div>
                      <div className="space-y-1">
                        {ts.map((t) => {
                          const isChecked = checksByTemplate.has(t.id)
                          return (
                            <label
                              key={t.id}
                              className="fg-panel-check"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() =>
                                  handleToggleCheck(t.id, roomId, isChecked)
                                }
                              />
                              <span className={isChecked ? 'is-done' : ''}>
                                {t.name}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        {/* ── Footer link to deep-edit page if needed ── */}
        {isAdmin && booking && (
          <div className="fg-panel-section" style={{ borderTop: 'none' }}>
            <Link
              href={`/admin/bookings/${booking.id}`}
              className="text-xs fg-mono"
              style={{ color: 'var(--color-blue)' }}
            >
              Open full booking detail page →
            </Link>
          </div>
        )}
      </div>

      {/* Floating ghost while dragging */}
      {drag && (
        <div
          className="fg-panel-pill-ghost"
          style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY }}
          aria-hidden
        >
          {drag.name}
        </div>
      )}
      {toast && (
        <Toast
          message={toast.message}
          onUndo={toast.undo}
          onDismiss={() => setToast(null)}
        />
      )}
    </aside>
  )
}

function PanelHeader({
  title,
  subtitle,
  status,
  onClose,
}: {
  title: string
  subtitle: string
  status: string | null
  onClose: () => void
}) {
  return (
    <div className="fg-panel-header">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h2
            className="text-xl truncate"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            {title}
          </h2>
          {status && <StatusPill status={status} />}
        </div>
        <div
          className="text-xs fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          {subtitle}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="fg-panel-close"
        aria-label="Close panel"
      >
        ×
      </button>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'fg-pill fg-pill-amber' },
    approved: { label: 'Approved', cls: 'fg-pill fg-pill-green' },
    declined: { label: 'Declined', cls: 'fg-pill fg-pill-muted' },
    cancelled: { label: 'Cancelled', cls: 'fg-pill fg-pill-muted' },
  }
  const m = map[status] ?? { label: status, cls: 'fg-pill fg-pill-muted' }
  return <span className={`${m.cls} text-xs shrink-0`}>{m.label}</span>
}

function PanelPill({
  bookingId,
  name,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onTap,
  onRemove,
}: {
  bookingId: string
  name: string
  onPointerDown: (e: React.PointerEvent, id: string, name: string) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onTap: (id: string, name: string) => void
  onRemove: (id: string, name: string) => void
}) {
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const movedRef = useRef(false)
  return (
    <div
      className="fg-panel-pill"
      onPointerDown={(e) => {
        startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
        movedRef.current = false
        onPointerDown(e, bookingId, name)
      }}
      onPointerMove={(e) => {
        const s = startRef.current
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 6) {
          movedRef.current = true
        }
        onPointerMove(e)
      }}
      onPointerUp={(e) => {
        const s = startRef.current
        const wasTap = s && !movedRef.current && Date.now() - s.t < 300
        startRef.current = null
        onPointerUp(e)
        if (wasTap) onTap(bookingId, name)
      }}
    >
      <span className="fg-panel-pill-name">{name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(bookingId, name)
        }}
        className="fg-panel-pill-remove"
        aria-label={`Remove ${name}`}
      >
        ×
      </button>
    </div>
  )
}



// ─── Profile-notes helpers (admin-only display) ──────────────────────────

function hasAnyNotes(notes: {
  dietary_notes: string | null
  allergies: string | null
  room_preference: string | null
  things_they_bring: string | null
  general_notes: string | null
}): boolean {
  return Boolean(
    notes.dietary_notes ||
      notes.allergies ||
      notes.room_preference ||
      notes.things_they_bring ||
      notes.general_notes,
  )
}

/**
 * v43: room picker used by the "+ Add guest" flow. Groups bedrooms by
 * floor and includes an "auto-pick" option for the common case where
 * the admin doesn't care which specific bed (just that the guest is in
 * the Attic, etc).
 */
function RoomPicker({
  rooms,
  value,
  onChange,
}: {
  rooms: Room[]
  value: string
  onChange: (id: string) => void
}) {
  const bedrooms = rooms.filter((r) => r.room_type === 'bedroom')
  // Group by floor for clearer scanning
  const byFloor = new Map<number, Room[]>()
  for (const r of bedrooms) {
    if (!byFloor.has(r.floor)) byFloor.set(r.floor, [])
    byFloor.get(r.floor)!.push(r)
  }
  const floorsDesc = Array.from(byFloor.keys()).sort((a, b) => b - a)

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="fg-input"
      style={{ fontSize: 13, marginBottom: 8 }}
      aria-label="Room (optional)"
    >
      <option value="">— Don&rsquo;t auto-assign a bed —</option>
      {floorsDesc.map((floor) => (
        <optgroup key={floor} label={floorLabel(floor)}>
          {byFloor.get(floor)!.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.is_owner_room ? ' (owner only)' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

function NoteRow({
  icon,
  label,
  text,
  emphasis,
}: {
  icon: string
  label: string
  text: string
  emphasis?: boolean
}) {
  return (
    <div
      className="text-sm px-3 py-2 rounded"
      style={{
        background: emphasis
          ? 'rgba(181, 114, 10, 0.08)'
          : 'var(--color-cream)',
        color: emphasis ? 'var(--color-amber)' : 'var(--color-ink)',
      }}
    >
      <span style={{ fontWeight: 600, marginRight: 6 }}>
        {icon} {label}:
      </span>
      <span style={{ color: emphasis ? 'var(--color-ink)' : 'inherit' }}>
        {text}
      </span>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { floorLabelShort } from '@/lib/floors'
import { moveBookingToRoomAndDates } from './actions'

const DAY_WIDTH_PX = 36
// v44 — narrowed from 260 to give phone viewports a usable amount of
// calendar space, and made `position: sticky; left: 0` so the room
// name column stays in view while horizontally scrolling dates.
// Mobile still sees the labels even after they scroll past in the
// virtual canvas — no more "where am I" disorientation.
const ROW_LABEL_WIDTH_PX = 170
const STICKY_LABEL_STYLE: React.CSSProperties = {
  width: ROW_LABEL_WIDTH_PX,
  position: 'sticky',
  left: 0,
  zIndex: 2,
  background: 'var(--color-paper, white)',
}

// Local copies of the date helpers so this client component doesn't pull
// the server-only auth-using lib/dates.
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function nightsBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00')
  const db = new Date(b + 'T00:00:00')
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function formatDateRange(a: string, b: string): string {
  const da = new Date(a + 'T00:00:00')
  const db = new Date(b + 'T00:00:00')
  const opt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${da.toLocaleDateString('en-GB', opt)} → ${db.toLocaleDateString('en-GB', opt)}`
}

type Booking = {
  id: string
  bed_id: string
  check_in: string
  check_out: string
  request_id: string | null
  guest_name: string | null
  guest_id?: string | null
  beds: { room_id: string } | null
  profiles: { full_name: string } | null
}

type Request = {
  id: string
  check_in: string
  check_out: string
  adults: number
  children: number
  notes: string | null
  status: 'pending' | 'approved' | 'declined'
  profiles: { full_name: string } | null
}

type Room = {
  id: string
  name: string
  floor: number
  is_owner_room: boolean
}

export default function BookingsCalendar({
  days,
  rooms,
  pending,
  approvedUnassigned,
  bookingsByRoom,
  startISO,
  currentMonthStart,
  onBookingTap,
  hideRequestLanes,
  roomStatuses,
}: {
  days: string[]
  rooms: Room[]
  pending: Request[]
  approvedUnassigned: Request[]
  bookingsByRoom: Record<string, Booking[]>
  startISO: string
  currentMonthStart: string
  /** When provided, taps on a booking bar call this instead of navigating
   *  to /admin/bookings/<id>. Used by the House page to open the
   *  slide-over panel. */
  onBookingTap?: (bookingId: string) => void
  /** When true, suppresses the pending + approved-unassigned lanes at the
   *  top of the grid. The House page renders those above the calendar in
   *  its own clickable cards, so the lanes here would duplicate. */
  hideRequestLanes?: boolean
  /** Optional v31: room statuses keyed by room.id, render as a small dot
   *  next to each room label. Pages that don't compute statuses can omit. */
  roomStatuses?: Record<string, { status: 'green' | 'orange' | 'red'; reason: string }>
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const totalDays = days.length

  // ─── Drag state ──────────────────────────────────────────────
  // grabDayOffset = index into `days` where the user grabbed the bar
  //               (0 means they grabbed the first cell of the booking)
  // hoverCell    = where the pointer currently is
  const [drag, setDrag] = useState<{
    bookingId: string
    name: string
    originalCheckIn: string
    originalCheckOut: string
    originalRoomId: string
    grabDateOffset: number  // how many days into the booking the user grabbed
    durationDays: number
    // Cursor position (in client coords) — used when no valid drop target,
    // so the ghost still follows the pointer rather than disappearing.
    x: number
    y: number
    // Snapped position (in client coords) — set when the cursor is over a
    // valid drop cell. The ghost renders here instead of at x/y, so it
    // visually aligns with where the booking will actually land.
    snappedX: number | null
    snappedY: number | null
  } | null>(null)
  const [hoverCell, setHoverCell] = useState<{ roomId: string; date: string } | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)

  function handlePointerDown(
    e: React.PointerEvent,
    booking: Booking,
    grabClientX: number
  ) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (!booking.beds) return

    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)

    // Work out which day cell the user grabbed inside the bar.
    // The bar's left edge corresponds to either booking.check_in or the
    // start of the visible window, whichever is later.
    const startOffset = nightsBetween(startISO, booking.check_in)
    const visibleStart = Math.max(0, startOffset)
    const rect = (target as HTMLElement).getBoundingClientRect()
    const offsetWithinBar = grabClientX - rect.left
    const cellsIntoVisible = Math.floor(offsetWithinBar / DAY_WIDTH_PX)
    const grabDateOffset = visibleStart + cellsIntoVisible // days from startISO
    const durationDays = nightsBetween(booking.check_in, booking.check_out)

    setDrag({
      bookingId: booking.id,
      name: booking.guest_name ?? booking.profiles?.full_name ?? 'Guest',
      originalCheckIn: booking.check_in,
      originalCheckOut: booking.check_out,
      originalRoomId: booking.beds.room_id,
      grabDateOffset,
      durationDays,
      x: e.clientX,
      y: e.clientY,
      snappedX: null,
      snappedY: null,
    })
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return
    e.preventDefault()

    // While dragging, the booking bar sits on top of the cells, so the
    // top-most element at the pointer is the bar itself. We use
    // elementsFromPoint (plural) and pick the first cell we find.
    const stack = document.elementsFromPoint(e.clientX, e.clientY)
    let foundCell: HTMLElement | null = null
    for (const el of stack) {
      if (el instanceof HTMLElement && el.dataset.cell) {
        foundCell = el
        break
      }
    }
    const newHoverCell =
      foundCell?.dataset.roomId && foundCell?.dataset.date
        ? { roomId: foundCell.dataset.roomId, date: foundCell.dataset.date }
        : null
    setHoverCell(newHoverCell)

    // Compute snapped ghost position. If the cursor is over a valid
    // cell, we put the ghost where the booking would actually land —
    // at the same X as the dotted preview bar. Otherwise the ghost
    // follows the cursor so it doesn't disappear off-screen.
    let snappedX: number | null = null
    let snappedY: number | null = null
    if (newHoverCell) {
      const rowEl = document.querySelector<HTMLElement>(
        `[data-room-row-id="${CSS.escape(newHoverCell.roomId)}"]`
      )
      if (rowEl) {
        // The preview's start date in the calendar:
        // grabDateOffset is days from startISO of the cell the user grabbed.
        // The original check-in is at nightsBetween(startISO, originalCheckIn).
        // The offset within the booking (how many days into it we grabbed)
        // is grabDateOffset - originalCheckInOffset. The preview's start
        // date is the hovered date minus that offset.
        const originalCheckInOffset = nightsBetween(startISO, drag.originalCheckIn)
        const grabOffsetWithinBooking = drag.grabDateOffset - originalCheckInOffset
        const hoveredDateOffset = nightsBetween(startISO, newHoverCell.date)
        const previewStartOffset = hoveredDateOffset - grabOffsetWithinBooking

        const rowRect = rowEl.getBoundingClientRect()
        // Match BookingBar's "left + 2" inset for X.
        // For Y: center the ghost vertically in the target row, which
        // works whether the row has 1 or N lanes. (The original "top + 8"
        // assumption broke when rows could have variable heights from
        // multi-guest stacking.)
        snappedX = rowRect.left + previewStartOffset * DAY_WIDTH_PX + 2
        snappedY = rowRect.top + (rowRect.height - 40) / 2
      }
    }

    setDrag((prev) =>
      prev ? { ...prev, x: e.clientX, y: e.clientY, snappedX, snappedY } : prev
    )
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!drag) return
    const target = e.currentTarget as HTMLElement
    try { target.releasePointerCapture(e.pointerId) } catch {}

    // v44: bug — handlePointerUp was reading the stale `hoverCell`
    // state. Under React's batching, the LAST handlePointerMove can
    // setState a new hoverCell that hasn't flushed before pointerUp
    // closes over its closure. Result: the dotted preview shows cell
    // N (the last visible state) but the drop computes against cell
    // N-1 (the previous state), or vice-versa — one square off.
    //
    // Fix: recompute the drop cell from the actual release coordinates,
    // exactly the same way handlePointerMove does. This guarantees the
    // drop matches what the dotted preview was showing.
    const stack = document.elementsFromPoint(e.clientX, e.clientY)
    let recomputedCell: { roomId: string; date: string } | null = null
    for (const el of stack) {
      if (
        el instanceof HTMLElement &&
        el.dataset.cell &&
        el.dataset.roomId &&
        el.dataset.date
      ) {
        recomputedCell = {
          roomId: el.dataset.roomId,
          date: el.dataset.date,
        }
        break
      }
    }
    const dropCell = recomputedCell ?? hoverCell
    const d = drag

    // Reset visuals first
    setDrag(null)
    setHoverCell(null)

    if (!dropCell) return

    // Compute new dates
    // The drop cell represents the date where the user's grabbed-day should land.
    const dropDate = dropCell.date
    const grabDate = addDaysISO(startISO, d.grabDateOffset)
    const deltaDays = nightsBetween(grabDate, dropDate)

    const newCheckIn = addDaysISO(d.originalCheckIn, deltaDays)
    const newCheckOut = addDaysISO(d.originalCheckOut, deltaDays)
    const newRoomId = dropCell.roomId

    // No-op detection — if nothing actually changed, skip the round-trip
    if (
      newCheckIn === d.originalCheckIn &&
      newCheckOut === d.originalCheckOut &&
      newRoomId === d.originalRoomId
    ) {
      return
    }

    startTransition(async () => {
      const result = await moveBookingToRoomAndDates(
        d.bookingId,
        newRoomId,
        newCheckIn,
        newCheckOut
      )
      if (result?.error) {
        setMoveError(result.error)
        return
      }
      setMoveError(null)
      router.refresh()
    })
  }

  function handlePointerCancel(e: React.PointerEvent) {
    if (!drag) return
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
    setDrag(null)
    setHoverCell(null)
  }

  // Lock body scroll while dragging
  useEffect(() => {
    if (drag) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [drag])

  // Auto-dismiss the error banner after a few seconds
  useEffect(() => {
    if (!moveError) return
    const t = setTimeout(() => setMoveError(null), 5000)
    return () => clearTimeout(t)
  }, [moveError])

  return (
    <>
      {moveError && (
        <div className="fg-msg-error mb-3">{moveError}</div>
      )}

      <div
        className="fg-card overflow-x-auto"
        style={{ padding: 0 }}
      >
        <div
          className="relative"
          style={{ minWidth: `${ROW_LABEL_WIDTH_PX + totalDays * DAY_WIDTH_PX}px` }}
        >
          {/* Header */}
          <div
            className="flex border-b"
            style={{ borderColor: 'var(--color-warm)' }}
          >
            <div
              className="shrink-0 px-4 py-3 fg-section-label flex items-center"
              style={STICKY_LABEL_STYLE}
            >
              Date →
            </div>
            <div className="flex flex-1">
              {days.map((iso, idx) => (
                <DayHeader
                  key={iso}
                  iso={iso}
                  showMonth={idx === 0 || iso.endsWith('-01')}
                />
              ))}
            </div>
          </div>

          {/* Pending lane */}
          {!hideRequestLanes && (
            <Lane
              label={`Pending (${pending.length})`}
              sublabel="awaiting your review"
              requests={pending}
              startISO={startISO}
              totalDays={totalDays}
              color="amber"
            />
          )}

          {/* Approved-unassigned lane */}
          {!hideRequestLanes && (
            <Lane
              label={`Approved (${approvedUnassigned.length})`}
              sublabel="needs bed assignment"
              requests={approvedUnassigned}
              startISO={startISO}
              totalDays={totalDays}
              color="green"
              showAssignLink
            />
          )}

          {!hideRequestLanes && (
            <div
              className="border-t-2"
              style={{ borderColor: 'var(--color-warm)' }}
            />
          )}

          {/* Room rows (draggable) */}
          {rooms.map((room) => (
            <RoomRow
              key={room.id}
              room={room}
              statusInfo={roomStatuses?.[room.id]}
              days={days}
              bookings={bookingsByRoom[room.id] ?? []}
              startISO={startISO}
              totalDays={totalDays}
              onPillPointerDown={handlePointerDown}
              onPillPointerMove={handlePointerMove}
              onPillPointerUp={handlePointerUp}
              onPillPointerCancel={handlePointerCancel}
              draggingBookingId={drag?.bookingId ?? null}
              hoverCellRoomId={hoverCell?.roomId ?? null}
              hoverCellDate={hoverCell?.date ?? null}
              dragPreview={
                drag && hoverCell
                  ? {
                      isThisRoom: hoverCell.roomId === room.id,
                      previewStartDate: addDaysISO(
                        hoverCell.date,
                        -((drag.grabDateOffset) - nightsBetween(startISO, drag.originalCheckIn)),
                      ),
                      durationDays: drag.durationDays,
                    }
                  : null
              }
              onBookingTap={onBookingTap}
            />
          ))}
        </div>
      </div>

      {/* Drag ghost — only visible when NOT over a valid drop target.
          When the cursor is over a valid room/date cell, the in-row
          dotted preview shows where the booking will land, and a
          duplicate floating ghost just adds confusion. So we hide it
          when snapped, leaving only the dotted preview. */}
      {drag && drag.snappedX === null && (
        <div
          className="fg-booking-ghost"
          style={{ left: drag.x, top: drag.y }}
          aria-hidden
        >
          {drag.name}
        </div>
      )}
    </>
  )
}

function DayHeader({ iso, showMonth }: { iso: string; showMonth: boolean }) {
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
        width: DAY_WIDTH_PX,
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
  color,
  showAssignLink = false,
}: {
  label: string
  sublabel: string
  requests: Request[]
  startISO: string
  totalDays: number
  color: 'amber' | 'green'
  showAssignLink?: boolean
}) {
  return (
    <div
      className="flex border-b items-stretch"
      style={{ borderColor: 'var(--color-warm)' }}
    >
      <div className="shrink-0 px-4 py-3" style={STICKY_LABEL_STYLE}>
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
        style={{ minHeight: 56, width: totalDays * DAY_WIDTH_PX }}
      >
        {Array.from({ length: totalDays }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 border-r"
            style={{
              left: i * DAY_WIDTH_PX,
              width: DAY_WIDTH_PX,
              borderColor: 'var(--color-warm)',
              opacity: 0.5,
            }}
          />
        ))}
        {requests.map((req) => (
          <RequestBar
            key={req.id}
            request={req}
            startISO={startISO}
            totalDays={totalDays}
            color={color}
            assignLink={showAssignLink}
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
  color,
  assignLink,
}: {
  request: Request
  startISO: string
  totalDays: number
  color: 'amber' | 'green'
  assignLink: boolean
}) {
  const startOffset = nightsBetween(startISO, request.check_in)
  const endOffset = nightsBetween(startISO, request.check_out)
  const visibleStart = Math.max(0, startOffset)
  const visibleEnd = Math.min(totalDays, endOffset)
  if (visibleEnd <= visibleStart) return null

  const leftPx = visibleStart * DAY_WIDTH_PX
  const widthPx = (visibleEnd - visibleStart) * DAY_WIDTH_PX
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

function RoomRow({
  room,
  statusInfo,
  days,
  bookings,
  startISO,
  totalDays,
  onPillPointerDown,
  onPillPointerMove,
  onPillPointerUp,
  onPillPointerCancel,
  draggingBookingId,
  hoverCellRoomId,
  hoverCellDate,
  dragPreview,
  onBookingTap,
}: {
  room: Room
  statusInfo?: { status: 'green' | 'orange' | 'red'; reason: string }
  days: string[]
  bookings: Booking[]
  startISO: string
  totalDays: number
  onPillPointerDown: (e: React.PointerEvent, booking: Booking, x: number) => void
  onPillPointerMove: (e: React.PointerEvent) => void
  onPillPointerUp: (e: React.PointerEvent) => void
  onPillPointerCancel: (e: React.PointerEvent) => void
  draggingBookingId: string | null
  hoverCellRoomId: string | null
  hoverCellDate: string | null
  dragPreview: { isThisRoom: boolean; previewStartDate: string; durationDays: number } | null
  onBookingTap?: (bookingId: string) => void
}) {
  // Compute "lane" assignment so overlapping bars stack vertically
  // instead of covering each other. A lane is a horizontal track within
  // the row. Two bookings can share a lane only if their date ranges
  // don't overlap.
  const sortedBookings = [...bookings].sort((a, b) => {
    if (a.check_in !== b.check_in) return a.check_in.localeCompare(b.check_in)
    return a.check_out.localeCompare(b.check_out)
  })
  const lanes: { laneEnd: string }[] = []
  const laneByBookingId = new Map<string, number>()
  for (const b of sortedBookings) {
    let placed = false
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i].laneEnd <= b.check_in) {
        lanes[i] = { laneEnd: b.check_out }
        laneByBookingId.set(b.id, i)
        placed = true
        break
      }
    }
    if (!placed) {
      lanes.push({ laneEnd: b.check_out })
      laneByBookingId.set(b.id, lanes.length - 1)
    }
  }
  const laneCount = lanes.length || 1

  // Row min-height grows with lane count
  const COMPACT_BAR_H = 22
  const COMPACT_GAP = 2
  const TOP_INSET = 4
  const computedMinHeight =
    laneCount <= 1
      ? 56
      : TOP_INSET + laneCount * COMPACT_BAR_H + (laneCount - 1) * COMPACT_GAP + TOP_INSET

  return (
    <div
      className="flex border-b items-stretch"
      style={{ borderColor: 'var(--color-warm)' }}
    >
      <div className="shrink-0 px-4 py-3" style={STICKY_LABEL_STYLE}>
        <div
          className="text-sm flex items-center gap-2"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          {statusInfo && (
            <span
              title={`${statusInfo.status === 'green' ? 'Ready' : statusInfo.status === 'orange' ? 'Occupied' : 'Needs cleaning'} — ${statusInfo.reason}`}
              aria-label={`${statusInfo.status === 'green' ? 'Ready' : statusInfo.status === 'orange' ? 'Occupied' : 'Needs cleaning'}`}
              style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: '50%',
                background:
                  statusInfo.status === 'green'
                    ? 'var(--color-green, #2f7a4f)'
                    : statusInfo.status === 'orange'
                      ? 'var(--color-amber, #A8862E)'
                      : 'var(--color-red, #b04030)',
                flexShrink: 0,
              }}
            />
          )}
          <span>{room.name}</span>
        </div>
        <div
          className="text-[10px] fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          {room.is_owner_room ? 'owner only' : floorLabelShort(room.floor)}
        </div>
      </div>
      <div
        className="relative flex-1"
        data-room-row-id={room.id}
        style={{ minHeight: computedMinHeight, width: totalDays * DAY_WIDTH_PX }}
      >
        {days.map((iso, i) => {
          const isWeekend = (() => {
            const d = new Date(iso + 'T00:00:00')
            return d.getDay() === 0 || d.getDay() === 6
          })()
          return (
            <div
              key={i}
              data-cell="1"
              data-room-id={room.id}
              data-date={iso}
              className="absolute top-0 bottom-0 border-r"
              style={{
                left: i * DAY_WIDTH_PX,
                width: DAY_WIDTH_PX,
                borderColor: 'var(--color-warm)',
                opacity: 0.5,
                background: isWeekend ? 'var(--color-cream)' : 'transparent',
              }}
            />
          )
        })}

        {/* Drop preview ghost (where the booking would land if released now) */}
        {dragPreview?.isThisRoom && (
          <DropPreview
            startISO={startISO}
            previewStartDate={dragPreview.previewStartDate}
            durationDays={dragPreview.durationDays}
            totalDays={totalDays}
            rowMinHeight={computedMinHeight}
          />
        )}

        {bookings.map((b) => (
          <BookingBar
            key={b.id}
            booking={b}
            roomName={room.name}
            startISO={startISO}
            totalDays={totalDays}
            isBeingDragged={draggingBookingId === b.id}
            lane={laneByBookingId.get(b.id) ?? 0}
            laneCount={laneCount}
            onPointerDown={onPillPointerDown}
            onPointerMove={onPillPointerMove}
            onPointerUp={onPillPointerUp}
            onPointerCancel={onPillPointerCancel}
            onBookingTap={onBookingTap}
          />
        ))}
      </div>
    </div>
  )
}

function DropPreview({
  startISO,
  previewStartDate,
  durationDays,
  totalDays,
  rowMinHeight,
}: {
  startISO: string
  previewStartDate: string
  durationDays: number
  totalDays: number
  rowMinHeight: number
}) {
  const startOffset = nightsBetween(startISO, previewStartDate)
  const endOffset = startOffset + durationDays
  const visibleStart = Math.max(0, startOffset)
  const visibleEnd = Math.min(totalDays, endOffset)
  if (visibleEnd <= visibleStart) return null

  return (
    <div
      className="absolute rounded"
      style={{
        left: visibleStart * DAY_WIDTH_PX + 2,
        width: (visibleEnd - visibleStart) * DAY_WIDTH_PX - 4,
        top: 4,
        height: rowMinHeight - 8,
        border: '2px dashed var(--color-gold)',
        background: 'rgba(168, 134, 46, 0.15)',
        pointerEvents: 'none',
      }}
    />
  )
}

function BookingBar({
  booking,
  roomName,
  startISO,
  totalDays,
  isBeingDragged,
  lane,
  laneCount,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onBookingTap,
}: {
  booking: Booking
  roomName: string
  startISO: string
  totalDays: number
  isBeingDragged: boolean
  lane: number
  laneCount: number
  onPointerDown: (e: React.PointerEvent, booking: Booking, x: number) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onPointerCancel: (e: React.PointerEvent) => void
  onBookingTap?: (bookingId: string) => void
}) {
  const router = useRouter()
  const startOffset = nightsBetween(startISO, booking.check_in)
  const endOffset = nightsBetween(startISO, booking.check_out)
  const visibleStart = Math.max(0, startOffset)
  const visibleEnd = Math.min(totalDays, endOffset)
  if (visibleEnd <= visibleStart) return null

  const leftPx = visibleStart * DAY_WIDTH_PX
  const widthPx = (visibleEnd - visibleStart) * DAY_WIDTH_PX
  const name = booking.guest_name ?? booking.profiles?.full_name ?? 'Guest'
  const nights = nightsBetween(booking.check_in, booking.check_out)
  const dateStr = formatDateRange(booking.check_in, booking.check_out)

  // Single lane: keep the original 40px-tall bar at top:8.
  // Two or more lanes: compact bars. v44: bumped from 22px to 30px so
  // each is closer to the 44px iOS tap-target ideal — the row's own
  // height grows to fit (see fg-room-row min-height in globals.css).
  const isCompact = laneCount > 1
  const barTop = isCompact ? 4 + lane * (30 + 3) : 8
  const barHeight = isCompact ? 30 : 40

  // Tap-vs-drag detection
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const movedRef = useRef(false)

  return (
    <div
      className="fg-booking-bar"
      style={{
        left: leftPx + 2,
        width: widthPx - 4,
        top: barTop,
        height: barHeight,
        fontSize: isCompact ? 10 : 11,
        opacity: isBeingDragged ? 0.35 : 1,
      }}
      onPointerDown={(e) => {
        startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
        movedRef.current = false
        onPointerDown(e, booking, e.clientX)
      }}
      onPointerMove={(e) => {
        const start = startRef.current
        if (start) {
          const dx = e.clientX - start.x
          const dy = e.clientY - start.y
          if (Math.hypot(dx, dy) > 6) movedRef.current = true
        }
        onPointerMove(e)
      }}
      onPointerUp={(e) => {
        const start = startRef.current
        const wasShortTap =
          start && !movedRef.current && Date.now() - start.t < 300
        startRef.current = null
        onPointerUp(e)
        if (wasShortTap) {
          if (onBookingTap) {
            onBookingTap(booking.id)
          } else {
            router.push(`/admin/bookings/${booking.id}`)
          }
        }
      }}
      onPointerCancel={(e) => {
        startRef.current = null
        movedRef.current = false
        onPointerCancel(e)
      }}
    >
      <span className="truncate">{name}</span>
      <div className="fg-booking-bar-pop" aria-hidden="true">
        <div className="fg-booking-bar-pop-name">{name}</div>
        <div className="fg-booking-bar-pop-meta">
          {roomName} · {dateStr} · {nights} night{nights === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  )
}

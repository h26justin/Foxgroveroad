'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  movePillToBed,
  addGuestToFirstAvailableBed,
  removeGuest,
  renameGuest,
  togglePrearrivalCheck,
} from './actions'

type Request = {
  id: string
  check_in: string
  check_out: string
  adults: number
  children: number
  status: string
  dateLabel: string
  requesterName: string
}

type Bed = { id: string; name: string; bed_type: string }
type Room = { id: string; name: string; floor: number; room_type: string; beds: Bed[] }

type Booking = {
  id: string
  bed_id: string
  guest_name: string
  check_in: string
  check_out: string
  request_id: string
}

type OverlapBooking = {
  id: string
  bed_id: string
  guest_name: string | null
  check_in: string
  check_out: string
  request_id: string | null
  profiles: { full_name: string } | null
}

type Template = { id: string; room_id: string; name: string; position: number }
type Check = { id: string; template_id: string; room_id: string | null }

const FLOOR_LABELS: Record<number, string> = {
  2: 'Attic',
  1: 'First floor',
  0: 'Garden floor',
}

export default function BedroomOrganiser({
  requests,
  selectedRequestId,
  rooms,
  bookings,
  overlappingBookings,
  templates,
  checks,
  savedMessage,
  errorMessage,
}: {
  requests: Request[]
  selectedRequestId: string | null
  rooms: Room[]
  bookings: Booking[]
  overlappingBookings: OverlapBooking[]
  templates: Template[]
  checks: Check[]
  savedMessage: string | null
  errorMessage: string | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Local error banner for drop-rejection messages. Self-dismisses so
  // we don't spam the URL with `?error=...` for transient feedback.
  const [localError, setLocalError] = useState<string | null>(null)
  useEffect(() => {
    if (!localError) return
    const t = setTimeout(() => setLocalError(null), 5000)
    return () => clearTimeout(t)
  }, [localError])

  // Map every bed_id that's already occupied by ANOTHER booking on these
  // dates to the occupant's display name. Beds in this map become blocked
  // drop targets.
  const blockedBedOccupant = new Map<string, string>()
  for (const o of overlappingBookings) {
    if (!o.bed_id) continue
    const name = o.guest_name || o.profiles?.full_name || 'Another guest'
    if (!blockedBedOccupant.has(o.bed_id)) {
      blockedBedOccupant.set(o.bed_id, name)
    }
  }

  // ─── Drag-and-drop state ─────────────────────────────────────────────
  const [drag, setDrag] = useState<{
    bookingId: string
    name: string
    x: number
    y: number
  } | null>(null)
  const [hoveredBedId, setHoveredBedId] = useState<string | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)

  function handlePointerDown(
    e: React.PointerEvent,
    bookingId: string,
    name: string
  ) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    setDrag({ bookingId, name, x: e.clientX, y: e.clientY })
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return
    e.preventDefault()
    setDrag((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev))

    // Find the bed under the pointer (skip our own ghost via pointer-events:none)
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const bedEl = el?.closest('[data-bed-id]') as HTMLElement | null
    const bedId = bedEl?.dataset.bedId ?? null

    // If the bed is blocked (occupied by another guest on these dates),
    // don't show the drop-zone highlight — visually communicate that the
    // drop won't be accepted.
    if (bedId && blockedBedOccupant.has(bedId)) {
      setHoveredBedId(null)
    } else {
      setHoveredBedId(bedId)
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!drag) return
    const target = e.currentTarget as HTMLElement
    try {
      target.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }

    const droppedBedId = hoveredBedId
    const droppedBookingId = drag.bookingId

    // Reset visuals BEFORE the network call so the pill snaps back if no drop
    setDrag(null)
    setHoveredBedId(null)
    dragStartRef.current = null

    if (!droppedBedId) return

    // Find the booking we're moving
    const booking = bookings.find((b) => b.id === droppedBookingId)
    if (!booking || booking.bed_id === droppedBedId) return

    // Belt-and-braces: if the bed somehow ended up blocked between
    // hover and drop (shouldn't happen because handlePointerMove ignores
    // blocked beds), bail out cleanly.
    if (blockedBedOccupant.has(droppedBedId)) {
      setLocalError(
        `That bed is already taken by ${blockedBedOccupant.get(droppedBedId)} on these dates.`
      )
      return
    }

    // Server move
    startTransition(async () => {
      const result = await movePillToBed(droppedBookingId, droppedBedId)
      if (result?.error) {
        setLocalError(result.error)
        return
      }
      router.refresh()
    })
  }

  // Cancel cleanup — phone call, system gesture, etc. interrupts the drag.
  function handlePointerCancel(e: React.PointerEvent) {
    if (!drag) return
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    setDrag(null)
    setHoveredBedId(null)
    dragStartRef.current = null
  }

  // ─── Group bookings by bed_id for quick lookup ──────────────────────
  const bookingsByBed = new Map<string, Booking[]>()
  for (const b of bookings) {
    if (!b.bed_id) continue
    if (!bookingsByBed.has(b.bed_id)) bookingsByBed.set(b.bed_id, [])
    bookingsByBed.get(b.bed_id)!.push(b)
  }

  // ─── Templates and checks grouped by room ───────────────────────────
  const templatesByRoom = new Map<string, Template[]>()
  for (const t of templates) {
    if (!templatesByRoom.has(t.room_id)) templatesByRoom.set(t.room_id, [])
    templatesByRoom.get(t.room_id)!.push(t)
  }
  const checksByTemplate = new Map<string, Check>()
  for (const c of checks) checksByTemplate.set(c.template_id, c)

  // Rooms with at least one assigned guest get a checklist visible
  const occupiedRoomIds = new Set<string>()
  for (const room of rooms) {
    if (room.beds.some((bed) => bookingsByBed.has(bed.id))) {
      occupiedRoomIds.add(room.id)
    }
  }

  const selectedRequest = requests.find((r) => r.id === selectedRequestId)
  const totalSlots = selectedRequest
    ? selectedRequest.adults + selectedRequest.children
    : 0
  const assignedCount = bookings.length

  // Group rooms by floor
  const byFloor = new Map<number, Room[]>()
  for (const r of rooms) {
    if (!byFloor.has(r.floor)) byFloor.set(r.floor, [])
    byFloor.get(r.floor)!.push(r)
  }
  const floorOrder = Array.from(byFloor.keys()).sort((a, b) => b - a)

  // ─── Server action wrappers ──────────────────────────────────────────
  function handleAddGuest() {
    if (!selectedRequestId) return
    const name = window.prompt('Guest name')
    if (!name?.trim()) return
    startTransition(async () => {
      const result = await addGuestToFirstAvailableBed(
        selectedRequestId,
        name.trim()
      )
      if (result?.error) {
        setLocalError(result.error)
        return
      }
      router.refresh()
    })
  }

  function handleRename(bookingId: string, currentName: string) {
    const name = window.prompt('Edit guest name', currentName)
    if (name == null || name.trim() === currentName) return
    if (!name.trim()) return
    startTransition(async () => {
      const result = await renameGuest(bookingId, name.trim())
      if (result?.error) {
        setLocalError(result.error)
        return
      }
      router.refresh()
    })
  }

  function handleRemove(bookingId: string, name: string) {
    if (!window.confirm(`Remove ${name}?`)) return
    startTransition(async () => {
      const result = await removeGuest(bookingId)
      if (result?.error) {
        setLocalError(result.error)
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
    if (!selectedRequestId) return
    startTransition(async () => {
      const result = await togglePrearrivalCheck(
        selectedRequestId,
        templateId,
        roomId,
        !isChecked
      )
      if (result?.error) {
        setLocalError(result.error)
        return
      }
      router.refresh()
    })
  }
  }

  // Lock body scroll while dragging on iOS
  useEffect(() => {
    if (drag) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [drag])

  return (
    <div>
      {savedMessage && <div className="fg-msg-success mb-4">{savedMessage}</div>}
      {errorMessage && <div className="fg-msg-error mb-4">{errorMessage}</div>}
      {localError && <div className="fg-msg-error mb-4">{localError}</div>}

      {/* ─── Request picker ─── */}
      <div className="fg-card p-4 mb-5">
        <label className="fg-label">Booking to organise</label>
        <select
          className="fg-input"
          value={selectedRequestId ?? ''}
          onChange={(e) => {
            const id = e.target.value
            router.push(`/bedrooms?request=${id}`)
          }}
        >
          {requests.map((r) => (
            <option key={r.id} value={r.id}>
              {r.requesterName} · {r.dateLabel} ({r.adults}+{r.children})
            </option>
          ))}
        </select>
        {selectedRequest && (
          <div
            className="text-xs fg-mono mt-3 flex items-center gap-3 flex-wrap"
            style={{ color: 'var(--color-muted)' }}
          >
            <span>
              {assignedCount} of {totalSlots || '?'} assigned
            </span>
            <button
              type="button"
              onClick={handleAddGuest}
              className="fg-btn-gold text-xs"
              style={{ width: 'auto', padding: '8px 14px' }}
            >
              + Add guest
            </button>
          </div>
        )}
      </div>

      {/* ─── Bedroom map ─── */}
      {floorOrder.map((floor) => {
        const floorRooms = byFloor.get(floor) ?? []
        return (
          <section key={floor} className="mb-6">
            <h2
              className="fg-section-label mb-2"
              style={{ color: 'var(--color-muted)' }}
            >
              {FLOOR_LABELS[floor] ?? `Floor ${floor}`}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {floorRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  bookingsByBed={bookingsByBed}
                  blockedBedOccupant={blockedBedOccupant}
                  hoveredBedId={hoveredBedId}
                  onPointerDownPill={handlePointerDown}
                  onPointerMovePill={handlePointerMove}
                  onPointerUpPill={handlePointerUp}
                  onPointerCancelPill={handlePointerCancel}
                  onPillTap={handleRename}
                  onPillRemove={handleRemove}
                  isOccupied={occupiedRoomIds.has(room.id)}
                  templates={templatesByRoom.get(room.id) ?? []}
                  checksByTemplate={checksByTemplate}
                  onToggleCheck={handleToggleCheck}
                  isDragging={drag !== null}
                />
              ))}
            </div>
          </section>
        )
      })}

      {/* ─── Drag ghost ─── */}
      {drag && (
        <div
          className="fg-pill-ghost"
          style={{ left: drag.x, top: drag.y }}
          aria-hidden
        >
          {drag.name}
        </div>
      )}
    </div>
  )
}

function RoomCard({
  room,
  bookingsByBed,
  blockedBedOccupant,
  hoveredBedId,
  onPointerDownPill,
  onPointerMovePill,
  onPointerUpPill,
  onPointerCancelPill,
  onPillTap,
  onPillRemove,
  isOccupied,
  templates,
  checksByTemplate,
  onToggleCheck,
  isDragging,
}: {
  room: Room
  bookingsByBed: Map<string, Booking[]>
  blockedBedOccupant: Map<string, string>
  hoveredBedId: string | null
  onPointerDownPill: (e: React.PointerEvent, bookingId: string, name: string) => void
  onPointerMovePill: (e: React.PointerEvent) => void
  onPointerUpPill: (e: React.PointerEvent) => void
  onPointerCancelPill: (e: React.PointerEvent) => void
  onPillTap: (bookingId: string, name: string) => void
  onPillRemove: (bookingId: string, name: string) => void
  isOccupied: boolean
  templates: Template[]
  checksByTemplate: Map<string, Check>
  onToggleCheck: (templateId: string, roomId: string, isChecked: boolean) => void
  isDragging: boolean
}) {
  const checkedCount = templates.filter((t) =>
    checksByTemplate.has(t.id)
  ).length
  const ready = templates.length > 0 && checkedCount === templates.length

  // Are ALL beds in this room blocked by other bookings? Then the whole
  // room is "fully booked elsewhere" — useful header info.
  const totalBeds = room.beds.length
  const blockedBeds = room.beds.filter((b) => blockedBedOccupant.has(b.id))
  const allBlocked = totalBeds > 0 && blockedBeds.length === totalBeds

  return (
    <div className="fg-bedroom-card">
      <div className="fg-bedroom-header">
        <span style={{ fontSize: 18 }}>🛏</span>
        <span className="fg-bedroom-name">{room.name}</span>
        {allBlocked && (
          <span
            className="fg-room-badge"
            style={{
              background: 'rgba(204, 51, 51, 0.13)',
              color: 'var(--color-red)',
            }}
          >
            booked
          </span>
        )}
        {!allBlocked && isOccupied && templates.length > 0 && (
          <span
            className={`fg-room-badge ${
              ready ? 'fg-room-badge-done' : 'fg-room-badge-due'
            }`}
          >
            {checkedCount}/{templates.length}
          </span>
        )}
      </div>

      {room.beds.length === 0 ? (
        <p
          className="text-xs fg-mono px-3 pb-3"
          style={{ color: 'var(--color-muted)' }}
        >
          No beds in this room.
        </p>
      ) : (
        <div className="fg-bed-grid">
          {room.beds.map((bed) => {
            const pills = bookingsByBed.get(bed.id) ?? []
            const isHovered = hoveredBedId === bed.id
            const blockedBy = blockedBedOccupant.get(bed.id) ?? null
            const isBlocked = blockedBy !== null
            return (
              <div
                key={bed.id}
                data-bed-id={bed.id}
                className={[
                  'fg-bed-slot',
                  isHovered ? 'is-hovered' : '',
                  isDragging && !isBlocked ? 'is-dropzone' : '',
                  isBlocked ? 'is-blocked' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="fg-bed-label">
                  {bed.name}
                  <span className="fg-bed-type">{bed.bed_type}</span>
                  {isBlocked && (
                    <span className="fg-bed-blocked-tag" title={`${blockedBy} is staying here on these dates`}>
                      {blockedBy}
                    </span>
                  )}
                </div>
                <div className="fg-pill-stack">
                  {pills.map((p) => (
                    <Pill
                      key={p.id}
                      bookingId={p.id}
                      name={p.guest_name}
                      onPointerDown={onPointerDownPill}
                      onPointerMove={onPointerMovePill}
                      onPointerUp={onPointerUpPill}
                      onPointerCancel={onPointerCancelPill}
                      onTap={onPillTap}
                      onRemove={onPillRemove}
                    />
                  ))}
                  {pills.length === 0 && !isBlocked && (
                    <span className="fg-bed-empty">empty</span>
                  )}
                  {pills.length === 0 && isBlocked && (
                    <span className="fg-bed-empty" style={{ fontStyle: 'italic' }}>
                      booked by another guest
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pre-arrival checklist */}
      {isOccupied && templates.length > 0 && (
        <div className="fg-prearrival-list">
          <div className="fg-prearrival-header">Pre-arrival</div>
          {templates.map((t) => {
            const check = checksByTemplate.get(t.id)
            const isChecked = !!check
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onToggleCheck(t.id, room.id, isChecked)}
                className={`fg-prearrival-item${
                  isChecked ? ' is-checked' : ''
                }`}
              >
                <span className="fg-prearrival-box" aria-hidden>
                  {isChecked && '✓'}
                </span>
                <span className="fg-prearrival-name">{t.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Pill({
  bookingId,
  name,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onTap,
  onRemove,
}: {
  bookingId: string
  name: string
  onPointerDown: (e: React.PointerEvent, bookingId: string, name: string) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onPointerCancel: (e: React.PointerEvent) => void
  onTap: (bookingId: string, name: string) => void
  onRemove: (bookingId: string, name: string) => void
}) {
  // Differentiate between drag and tap by tracking start vs end position
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const movedRef = useRef(false)

  return (
    <div className="fg-pill-wrap">
      <div
        className="fg-pill-guest"
        onPointerDown={(e) => {
          startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
          movedRef.current = false
          onPointerDown(e, bookingId, name)
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
            start &&
            !movedRef.current &&
            Date.now() - start.t < 300

          startRef.current = null
          onPointerUp(e)

          if (wasShortTap) {
            onTap(bookingId, name)
          }
        }}
        onPointerCancel={(e) => {
          startRef.current = null
          movedRef.current = false
          onPointerCancel(e)
        }}
      >
        {name}
      </div>
      <button
        type="button"
        className="fg-pill-remove"
        aria-label={`Remove ${name}`}
        onClick={(e) => {
          e.stopPropagation()
          onRemove(bookingId, name)
        }}
      >
        ×
      </button>
    </div>
  )
}

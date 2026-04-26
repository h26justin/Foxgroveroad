import Link from 'next/link'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  formatDate,
  formatDateRange,
  nightsBetween,
  relativeFromToday,
  todayISO,
} from '@/lib/dates'

const DAYS_VISIBLE = 30

export default async function HousePage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>
}) {
  await requireProfile()
  const supabase = await createClient()
  const { start } = await searchParams

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

  // Rooms
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, floor, is_owner_room')
    .order('floor', { ascending: false })
    .order('name')

  // Approved bed-level bookings overlapping the visible window
  const { data: visibleBookings } = await supabase
    .from('bookings')
    .select(
      'id, bed_id, check_in, check_out, guest_name, beds:beds!bookings_bed_id_fkey(room_id), profiles:profiles!bookings_requested_by_fkey(full_name)'
    )
    .eq('status', 'approved')
    .lt('check_in', endISO)
    .gt('check_out', startISO)
    .order('check_in')

  // Group by room
  const bookingsByRoom = new Map<string, any[]>()
  for (const b of visibleBookings ?? []) {
    const roomId = (b.beds as any)?.room_id
    if (!roomId) continue
    if (!bookingsByRoom.has(roomId)) bookingsByRoom.set(roomId, [])
    bookingsByRoom.get(roomId)!.push(b)
  }

  // Today snapshot
  const today = todayISO()
  const currentlyIn = (visibleBookings ?? []).filter(
    (b) => b.check_in <= today && b.check_out > today
  )
  const upcoming = (visibleBookings ?? [])
    .filter((b) => b.check_in > today)
    .slice(0, 5)

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
          The house
        </h1>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          {formatDate(days[0])} → {formatDate(days[days.length - 1])} · who's
          staying when
        </p>
      </div>

      {/* Quick today/next summary */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div
          className="fg-card p-5"
          style={{ borderLeft: '4px solid var(--color-green)' }}
        >
          <div
            className="text-3xl"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            {currentlyIn.length}
          </div>
          <div
            className="text-xs fg-mono uppercase mt-1"
            style={{ color: 'var(--color-muted)' }}
          >
            Beds in use today
          </div>
          {currentlyIn.length > 0 && (
            <div
              className="text-xs fg-mono mt-2"
              style={{ color: 'var(--color-ink)' }}
            >
              {Array.from(
                new Set(
                  currentlyIn.map(
                    (b) => (b.profiles as any)?.full_name ?? b.guest_name
                  )
                )
              ).join(', ')}
            </div>
          )}
        </div>

        <div
          className="fg-card p-5"
          style={{ borderLeft: '4px solid var(--color-gold)' }}
        >
          <div
            className="text-3xl"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            {upcoming.length > 0
              ? relativeFromToday(upcoming[0].check_in)
              : '—'}
          </div>
          <div
            className="text-xs fg-mono uppercase mt-1"
            style={{ color: 'var(--color-muted)' }}
          >
            Next arrival
          </div>
          {upcoming.length > 0 && (
            <div
              className="text-xs fg-mono mt-2"
              style={{ color: 'var(--color-ink)' }}
            >
              {(upcoming[0].profiles as any)?.full_name ??
                upcoming[0].guest_name}
            </div>
          )}
        </div>
      </div>

      {/* Date range navigation */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Link
            href={`/house?start=${prevStart}`}
            className="fg-btn-ghost text-sm"
          >
            ← Previous {DAYS_VISIBLE} days
          </Link>
          <Link
            href={`/house?start=${todayISO()}`}
            className="fg-btn-ghost text-sm"
          >
            Today
          </Link>
          <Link
            href={`/house?start=${nextStart}`}
            className="fg-btn-ghost text-sm"
          >
            Next {DAYS_VISIBLE} days →
          </Link>
        </div>
        <Link href="/bookings/new" className="fg-btn-gold text-sm">
          + Request a stay
        </Link>
      </div>

      {/* Calendar */}
      <Calendar
        days={days}
        rooms={rooms ?? []}
        bookingsByRoom={bookingsByRoom}
        startISO={startISO}
      />

      {/* Legend / privacy note */}
      <div
        className="flex items-center gap-4 mt-4 text-xs fg-mono flex-wrap"
        style={{ color: 'var(--color-muted)' }}
      >
        <span className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded"
            style={{ background: 'var(--color-green)' }}
          />
          Approved booking
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded border"
            style={{
              background: 'var(--color-cream)',
              borderColor: 'var(--color-warm)',
            }}
          />
          Weekend
        </span>
        <span style={{ marginLeft: 'auto' }}>
          Pending requests are private to the requester &amp; admin.
        </span>
      </div>
    </div>
  )
}

// ---------- Calendar grid ----------

function Calendar({
  days,
  rooms,
  bookingsByRoom,
  startISO,
}: {
  days: string[]
  rooms: any[]
  bookingsByRoom: Map<string, any[]>
  startISO: string
}) {
  const totalDays = days.length
  const dayWidthPx = 36

  // Group rooms by floor for visual separation
  const floors: { label: string; rooms: any[] }[] = [
    { label: 'Attic', rooms: rooms.filter((r) => r.floor === 2) },
    { label: 'First floor', rooms: rooms.filter((r) => r.floor === 1) },
    { label: 'Garden floor', rooms: rooms.filter((r) => r.floor === 0) },
  ].filter((f) => f.rooms.length > 0)

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
            Bedrooms ↓
          </div>
          <div className="flex flex-1">
            {days.map((iso, idx) => (
              <DayHeader
                key={iso}
                iso={iso}
                showMonth={idx === 0 || iso.endsWith('-01')}
                widthPx={dayWidthPx}
              />
            ))}
          </div>
        </div>

        {floors.map((floor, fi) => (
          <div key={floor.label}>
            {/* Floor label */}
            <div
              className="flex"
              style={{
                background: 'var(--color-cream)',
                borderTop: fi > 0 ? '2px solid var(--color-warm)' : 'none',
                borderBottom: '1px solid var(--color-warm)',
              }}
            >
              <div
                className="shrink-0 px-4 py-2 fg-section-label"
                style={{ width: 260, color: 'var(--color-gold)' }}
              >
                {floor.label}
              </div>
              <div style={{ flex: 1 }} />
            </div>

            {floor.rooms.map((room) => (
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
        ))}
      </div>
    </div>
  )
}

function DayHeader({
  iso,
  showMonth,
  widthPx,
}: {
  iso: string
  showMonth: boolean
  widthPx: number
}) {
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

function RoomRow({
  room,
  days,
  dayWidthPx,
  bookings,
  startISO,
  totalDays,
}: {
  room: any
  days: string[]
  dayWidthPx: number
  bookings: any[]
  startISO: string
  totalDays: number
}) {
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
        {room.is_owner_room && (
          <div
            className="text-[10px] fg-mono mt-0.5"
            style={{ color: 'var(--color-gold)' }}
          >
            owner only
          </div>
        )}
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
        {bookings.map((b) => (
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

function BookingBar({
  booking,
  startISO,
  totalDays,
  dayWidthPx,
}: {
  booking: any
  startISO: string
  totalDays: number
  dayWidthPx: number
}) {
  const startOffset = nightsBetween(startISO, booking.check_in)
  const endOffset = nightsBetween(startISO, booking.check_out)
  const visibleStart = Math.max(0, startOffset)
  const visibleEnd = Math.min(totalDays, endOffset)
  if (visibleEnd <= visibleStart) return null

  const leftPx = visibleStart * dayWidthPx
  const widthPx = (visibleEnd - visibleStart) * dayWidthPx
  const name = booking.profiles?.full_name ?? booking.guest_name

  return (
    <div
      className="absolute rounded text-xs flex items-center px-2 overflow-hidden"
      style={{
        left: leftPx + 2,
        width: widthPx - 4,
        top: 8,
        height: 40,
        background: 'var(--color-green)',
        color: 'white',
        fontWeight: 500,
      }}
      title={`${name} · ${formatDateRange(booking.check_in, booking.check_out)}`}
    >
      <span className="truncate">{name}</span>
    </div>
  )
}

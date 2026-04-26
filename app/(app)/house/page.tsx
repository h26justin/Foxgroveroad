import Link from 'next/link'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDateRange, todayISO, relativeFromToday, formatDate } from '@/lib/dates'

export default async function HousePage() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const today = todayISO()

  // Get all rooms with their beds
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, floor, is_owner_room, cleaning_status')
    .order('floor', { ascending: false })
    .order('name')

  const { data: beds } = await supabase
    .from('beds')
    .select('id, room_id, name, bed_type')
    .order('name')

  // Get current and upcoming approved bookings (next 30 days)
  const thirtyDaysOut = (() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })()

  const { data: bookings } = await supabase
    .from('bookings')
    .select(
      'id, bed_id, check_in, check_out, guest_name, status, profiles:profiles!bookings_requested_by_fkey(full_name)'
    )
    .eq('status', 'approved')
    .lt('check_in', thirtyDaysOut)
    .gt('check_out', today)
    .order('check_in')

  // Group bookings by bed
  const bookingsByBed = new Map<string, any[]>()
  for (const b of bookings ?? []) {
    if (!b.bed_id) continue
    if (!bookingsByBed.has(b.bed_id)) bookingsByBed.set(b.bed_id, [])
    bookingsByBed.get(b.bed_id)!.push(b)
  }

  // Group beds by room
  const bedsByRoom = new Map<string, any[]>()
  for (const bed of beds ?? []) {
    if (!bedsByRoom.has(bed.room_id)) bedsByRoom.set(bed.room_id, [])
    bedsByRoom.get(bed.room_id)!.push(bed)
  }

  return (
    <div>
      <div className="mb-8">
        <h1
          className="text-3xl mb-2"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
        >
          The house
        </h1>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          {formatDate(today)} · who's staying where over the next 30 days
        </p>
      </div>

      {/* Group rooms by floor */}
      {[2, 1, 0].map((floor) => {
        const floorRooms = (rooms ?? []).filter((r) => r.floor === floor)
        if (floorRooms.length === 0) return null
        const floorLabel =
          floor === 2 ? 'Attic' : floor === 1 ? 'First floor' : 'Garden floor'

        return (
          <section key={floor} className="mb-10">
            <h2 className="fg-section-label mb-3">{floorLabel}</h2>
            <div className="space-y-3">
              {floorRooms.map((room) => {
                const roomBeds = bedsByRoom.get(room.id) ?? []
                const allBookings = roomBeds.flatMap(
                  (b) => bookingsByBed.get(b.id) ?? []
                )
                const currentBookings = allBookings.filter(
                  (b) => b.check_in <= today && b.check_out > today
                )
                const isOccupiedNow = currentBookings.length > 0

                return (
                  <RoomCard
                    key={room.id}
                    room={room}
                    beds={roomBeds}
                    bookingsByBed={bookingsByBed}
                    isOccupiedNow={isOccupiedNow}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function RoomCard({
  room,
  beds,
  bookingsByBed,
  isOccupiedNow,
}: {
  room: any
  beds: any[]
  bookingsByBed: Map<string, any[]>
  isOccupiedNow: boolean
}) {
  return (
    <div
      className="fg-card p-5"
      style={{
        borderLeft: `4px solid ${
          isOccupiedNow
            ? 'var(--color-green)'
            : room.is_owner_room
              ? 'var(--color-gold)'
              : 'var(--color-warm)'
        }`,
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3
            className="text-lg"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            {room.name}
          </h3>
          <p
            className="text-xs fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            {beds.length} bed{beds.length === 1 ? '' : 's'}
            {room.is_owner_room && ' · owner only'}
          </p>
        </div>
        <StateChip
          isOccupied={isOccupiedNow}
          isOwner={room.is_owner_room}
        />
      </div>

      {/* Beds */}
      <div className="space-y-2">
        {beds.map((bed) => {
          const bedBookings = bookingsByBed.get(bed.id) ?? []
          return (
            <BedRow key={bed.id} bed={bed} bookings={bedBookings} />
          )
        })}
      </div>
    </div>
  )
}

function StateChip({
  isOccupied,
  isOwner,
}: {
  isOccupied: boolean
  isOwner: boolean
}) {
  if (isOccupied) {
    return <span className="fg-pill fg-pill-green">occupied now</span>
  }
  if (isOwner) {
    return <span className="fg-pill fg-pill-gold">owner only</span>
  }
  return <span className="fg-pill fg-pill-muted">available</span>
}

function BedRow({ bed, bookings }: { bed: any; bookings: any[] }) {
  const today = todayISO()
  const current = bookings.find(
    (b) => b.check_in <= today && b.check_out > today
  )
  const upcoming = bookings.filter((b) => b.check_in > today).slice(0, 2)

  return (
    <div
      className="text-sm flex items-start gap-3 py-2 px-3 rounded"
      style={{ background: 'var(--color-cream)' }}
    >
      <div
        className="shrink-0 fg-mono text-xs pt-0.5"
        style={{ color: 'var(--color-muted)', minWidth: 100 }}
      >
        {bed.name}
      </div>
      <div className="flex-1 min-w-0">
        {current ? (
          <div>
            <div style={{ color: 'var(--color-green)', fontWeight: 500 }}>
              {current.profiles?.full_name ?? current.guest_name} · checked in
            </div>
            <div
              className="text-xs fg-mono"
              style={{ color: 'var(--color-muted)' }}
            >
              checks out {relativeFromToday(current.check_out)}
            </div>
          </div>
        ) : upcoming.length > 0 ? (
          <div>
            <div style={{ color: 'var(--color-ink)' }}>
              Next: {upcoming[0].profiles?.full_name ?? upcoming[0].guest_name}
            </div>
            <div
              className="text-xs fg-mono"
              style={{ color: 'var(--color-muted)' }}
            >
              {formatDateRange(upcoming[0].check_in, upcoming[0].check_out)}
            </div>
          </div>
        ) : (
          <span style={{ color: 'var(--color-muted)' }}>—</span>
        )}
      </div>
    </div>
  )
}

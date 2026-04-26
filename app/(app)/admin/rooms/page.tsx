import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const FLOOR_LABELS: Record<number, string> = {
  2: 'Attic',
  1: 'First floor',
  0: 'Garden floor',
}

const TYPE_META: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  bedroom: { label: 'Bedroom', icon: '🛏', color: 'var(--color-blue)' },
  bathroom: { label: 'Bathroom', icon: '🛁', color: 'var(--color-blue)' },
  kitchen: { label: 'Kitchen', icon: '🍳', color: 'var(--color-amber)' },
  dining: { label: 'Dining', icon: '🍽', color: 'var(--color-amber)' },
  living: { label: 'Living', icon: '🛋', color: 'var(--color-green)' },
  utility: { label: 'Utility', icon: '🧺', color: 'var(--color-muted)' },
  common: { label: 'Common', icon: '↗', color: 'var(--color-muted)' },
}

const STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  clean: { label: 'Clean', color: 'var(--color-green)' },
  occupied: { label: 'Occupied', color: 'var(--color-blue)' },
  needs_cleaning: { label: 'Needs cleaning', color: 'var(--color-red)' },
  in_progress: { label: 'Being cleaned', color: 'var(--color-amber)' },
  ready: { label: 'Ready', color: 'var(--color-green)' },
}

export default async function AdminRoomsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: rooms } = await supabase
    .from('rooms')
    .select(
      'id, name, floor, room_type, is_owner_room, cleaning_status, beds(id, name, bed_type)'
    )
    .order('floor', { ascending: false })
    .order('name')

  const byFloor = new Map<number, any[]>()
  for (const r of rooms ?? []) {
    if (!byFloor.has(r.floor)) byFloor.set(r.floor, [])
    byFloor.get(r.floor)!.push(r)
  }

  const floorOrder = Array.from(byFloor.keys()).sort((a, b) => b - a)

  // Stats
  const totalRooms = rooms?.length ?? 0
  const totalBedrooms =
    rooms?.filter((r) => r.room_type === 'bedroom').length ?? 0
  const totalBeds =
    rooms?.reduce((acc, r) => acc + ((r.beds as any[]) || []).length, 0) ?? 0

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
          Rooms
        </h1>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          {totalRooms} room{totalRooms === 1 ? '' : 's'} ·{' '}
          {totalBedrooms} bedroom{totalBedrooms === 1 ? '' : 's'} ·{' '}
          {totalBeds} bed{totalBeds === 1 ? '' : 's'}
        </p>
      </div>

      {/* Floor sections */}
      {floorOrder.map((floor) => {
        const floorRooms = byFloor.get(floor) ?? []
        return (
          <section key={floor} className="mb-10">
            <div className="flex items-baseline justify-between mb-3">
              <h2
                className="text-xl"
                style={{
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--color-ink)',
                }}
              >
                {FLOOR_LABELS[floor] ?? `Floor ${floor}`}
              </h2>
              <span
                className="text-xs fg-mono"
                style={{ color: 'var(--color-muted)' }}
              >
                {floorRooms.length} room{floorRooms.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {floorRooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
          </section>
        )
      })}

      {totalRooms === 0 && (
        <div className="fg-card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No rooms set up yet. Run the rooms migration in Supabase to seed
            the Foxgrove rooms.
          </p>
        </div>
      )}

      {/* Helpful aside */}
      <div
        className="fg-card mt-10 p-5"
        style={{ borderLeft: '4px solid var(--color-gold-soft)' }}
      >
        <div
          className="fg-section-label mb-2"
          style={{ color: 'var(--color-gold)' }}
        >
          What's next for rooms
        </div>
        <p
          className="text-sm"
          style={{ color: 'var(--color-ink)', lineHeight: 1.6 }}
        >
          The rooms inventory is in place. Once Linda &amp; Sam have signed
          up and you've shared the cleaning checklists from your old Sweepy
          setup, we can wire up turnaround tasks (e.g. 19-step Master
          Ensuite, 30-step Kitchen) and start the cleaner-facing today view.
        </p>
      </div>
    </div>
  )
}

function RoomCard({ room }: { room: any }) {
  const typeMeta = TYPE_META[room.room_type] ?? TYPE_META.common
  const status = STATUS_META[room.cleaning_status] ?? null
  const beds: any[] = (room.beds as any[]) ?? []

  return (
    <div
      className="fg-card p-4"
      style={{
        borderLeft: `3px solid ${typeMeta.color}`,
      }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span style={{ fontSize: 18 }}>{typeMeta.icon}</span>
          <h3
            className="text-base truncate"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            {room.name}
          </h3>
        </div>
        {room.is_owner_room && (
          <span
            className="text-[10px] fg-mono uppercase shrink-0 ml-2"
            style={{ color: 'var(--color-gold)' }}
          >
            owner only
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <span
          className="text-xs fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          {typeMeta.label}
        </span>

        {beds.length > 0 && (
          <span
            className="text-xs fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            · {beds.length} bed{beds.length === 1 ? '' : 's'}
          </span>
        )}

        {status && (
          <span
            className="text-[10px] fg-mono uppercase ml-auto"
            style={{
              color: status.color,
              fontWeight: 600,
            }}
          >
            {status.label}
          </span>
        )}
      </div>

      {beds.length > 0 && (
        <div
          className="text-[11px] fg-mono mt-2 pt-2 border-t"
          style={{
            color: 'var(--color-muted)',
            borderColor: 'var(--color-warm)',
          }}
        >
          {beds.map((b) => b.name).join(' · ')}
        </div>
      )}
    </div>
  )
}

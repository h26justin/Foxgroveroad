'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  recomputeLinenFromBeds,
  updateLinenCount,
} from './actions'

type Bed = { id: string; name: string; bed_type: string }
type Room = {
  id: string
  name: string
  floor: number
  room_type: string
  beds: Bed[]
}

type Linen = {
  id: string
  room_id: string
  item_type: string
  size: string | null
  expected_count: number
  clean_count: number
  dirty_count: number
  washing_count: number
  notes: string | null
  updated_at: string
}

type Profile = { id: string; full_name: string; role: string }

const ITEM_LABELS: Record<string, string> = {
  pillowcase: 'Pillowcases',
  duvet_cover: 'Duvet covers',
  fitted_sheet: 'Fitted sheets',
  flat_sheet: 'Flat sheets',
  bath_towel: 'Bath towels',
  hand_towel: 'Hand towels',
  face_cloth: 'Face cloths',
  bath_mat: 'Bath mats',
}

const ITEM_ORDER = [
  'pillowcase',
  'duvet_cover',
  'fitted_sheet',
  'flat_sheet',
  'bath_towel',
  'hand_towel',
  'face_cloth',
  'bath_mat',
]

export default function LinenClient({
  profile,
  rooms,
  linen,
  savedMessage,
  errorMessage,
}: {
  profile: Profile
  rooms: Room[]
  linen: Linen[]
  savedMessage: string | null
  errorMessage: string | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Group linen by room
  const linenByRoom = useMemo(() => {
    const m = new Map<string, Linen[]>()
    for (const l of linen) {
      if (!m.has(l.room_id)) m.set(l.room_id, [])
      m.get(l.room_id)!.push(l)
    }
    return m
  }, [linen])

  // Stats
  const totals = useMemo(() => {
    let expected = 0
    let clean = 0
    let dirty = 0
    let washing = 0
    for (const l of linen) {
      expected += l.expected_count
      clean += l.clean_count
      dirty += l.dirty_count
      washing += l.washing_count
    }
    return { expected, clean, dirty, washing, owned: clean + dirty + washing }
  }, [linen])

  // Show only rooms that have linen (or all bedrooms if there's none yet)
  const visibleRooms = useMemo(() => {
    if (linen.length === 0) {
      return rooms.filter((r) => r.room_type === 'bedroom')
    }
    return rooms.filter((r) => linenByRoom.has(r.id))
  }, [rooms, linenByRoom, linen.length])

  // Accordion: which rooms are expanded
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (roomId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(roomId)) next.delete(roomId)
      else next.add(roomId)
      return next
    })
  }

  function handleRecompute() {
    if (
      !window.confirm(
        'Recompute expected linen counts from beds? Existing clean/dirty/washing counts are preserved.'
      )
    )
      return
    startTransition(async () => {
      const result = await recomputeLinenFromBeds()
      if (result?.error) {
        router.push(`/linen?error=${encodeURIComponent(result.error)}`)
        return
      }
      router.push('/linen?saved=1')
      router.refresh()
    })
  }

  function handleUpdate(
    linenId: string,
    field: 'clean_count' | 'dirty_count' | 'washing_count',
    delta: number
  ) {
    startTransition(async () => {
      const result = await updateLinenCount(linenId, field, delta)
      if (result?.error) {
        router.push(`/linen?error=${encodeURIComponent(result.error)}`)
        return
      }
      router.refresh()
    })
  }

  const isAdmin = profile.role === 'admin'

  return (
    <div>
      {/* ─── Header ─── */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <h1
            className="text-3xl md:text-4xl"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            Linen
          </h1>
          {isAdmin && (
            <button
              type="button"
              onClick={handleRecompute}
              className="fg-btn-ghost text-xs"
              style={{ width: 'auto' }}
            >
              Recompute from beds →
            </button>
          )}
        </div>
        <p
          className="text-sm fg-mono mt-2"
          style={{ color: 'var(--color-muted)' }}
        >
          {totals.expected === 0 ? (
            <>
              No linen tracked yet.
              {isAdmin && ' Tap “Recompute from beds” to seed.'}
            </>
          ) : (
            <>
              {totals.owned}/{totals.expected} owned ·{' '}
              <span style={{ color: 'var(--color-green)' }}>
                {totals.clean} clean
              </span>{' '}
              ·{' '}
              <span style={{ color: 'var(--color-amber)' }}>
                {totals.dirty} dirty
              </span>{' '}
              ·{' '}
              <span style={{ color: 'var(--color-blue)' }}>
                {totals.washing} washing
              </span>
            </>
          )}
        </p>
      </div>

      {savedMessage && <div className="fg-msg-success mb-4">Saved.</div>}
      {errorMessage && <div className="fg-msg-error mb-4">{errorMessage}</div>}

      {/* ─── Empty state ─── */}
      {linen.length === 0 && isAdmin && (
        <div className="fg-card p-8 text-center">
          <div style={{ fontSize: 36, marginBottom: 12 }}>🧺</div>
          <p
            className="text-base mb-2"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            Set up linen tracking
          </p>
          <p
            className="text-sm fg-mono mb-4"
            style={{ color: 'var(--color-muted)' }}
          >
            We'll work out the expected counts from each bedroom's beds, using
            2 sets per room: 2 pillowcases per pillow, 2 duvet covers per bed,
            and so on.
          </p>
          <button
            type="button"
            onClick={handleRecompute}
            className="fg-btn-gold"
            style={{ width: 'auto' }}
          >
            Compute from beds
          </button>
        </div>
      )}

      {/* ─── Room list ─── */}
      <div className="space-y-3">
        {visibleRooms.map((room) => {
          const items = (linenByRoom.get(room.id) ?? []).sort((a, b) => {
            const ia = ITEM_ORDER.indexOf(a.item_type)
            const ib = ITEM_ORDER.indexOf(b.item_type)
            return (
              (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) ||
              (a.size ?? '').localeCompare(b.size ?? '')
            )
          })
          const isExpanded = expanded.has(room.id)
          const totalExpected = items.reduce(
            (s, i) => s + i.expected_count,
            0
          )
          const totalOwned = items.reduce(
            (s, i) => s + i.clean_count + i.dirty_count + i.washing_count,
            0
          )
          const isShort = totalOwned < totalExpected

          return (
            <div key={room.id} className="fg-room-card">
              <button
                type="button"
                onClick={() => toggle(room.id)}
                className="fg-room-header"
                aria-expanded={isExpanded}
              >
                <span
                  className={`fg-room-chevron${
                    isExpanded ? ' is-open' : ''
                  }`}
                  aria-hidden
                >
                  ▸
                </span>
                <span style={{ fontSize: 18, marginRight: 4 }}>
                  {room.room_type === 'bathroom' ? '🛁' : '🛏'}
                </span>
                <span className="fg-room-name">{room.name}</span>
                <span className="fg-room-counts">
                  {items.length === 0 ? (
                    <span
                      className="fg-room-badge fg-room-badge-due"
                      style={{
                        background: 'rgba(107, 113, 145, 0.13)',
                        color: 'var(--color-muted)',
                      }}
                    >
                      no items
                    </span>
                  ) : isShort ? (
                    <span className="fg-room-badge fg-room-badge-due">
                      {totalOwned}/{totalExpected}
                    </span>
                  ) : (
                    <span className="fg-room-badge fg-room-badge-done">
                      {totalOwned}/{totalExpected} ✓
                    </span>
                  )}
                </span>
              </button>

              {isExpanded && (
                <div className="fg-room-body">
                  {items.length === 0 ? (
                    <p
                      className="text-xs fg-mono text-center py-6"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      No linen items for this room yet.
                    </p>
                  ) : (
                    <div className="px-3 py-3 space-y-2">
                      {items.map((item) => (
                        <LinenRow
                          key={item.id}
                          item={item}
                          onUpdate={handleUpdate}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LinenRow({
  item,
  onUpdate,
}: {
  item: Linen
  onUpdate: (
    id: string,
    field: 'clean_count' | 'dirty_count' | 'washing_count',
    delta: number
  ) => void
}) {
  const owned = item.clean_count + item.dirty_count + item.washing_count
  const isShort = owned < item.expected_count
  const label = ITEM_LABELS[item.item_type] ?? item.item_type

  return (
    <div className="fg-linen-row">
      <div className="fg-linen-name">
        {label}
        {item.size && (
          <span className="fg-linen-size">{item.size}</span>
        )}
        <span
          className={`fg-linen-totals${isShort ? ' is-short' : ''}`}
        >
          {owned} / {item.expected_count}
        </span>
      </div>
      <div className="fg-linen-counters">
        <Counter
          label="Clean"
          value={item.clean_count}
          color="var(--color-green)"
          onMinus={() => onUpdate(item.id, 'clean_count', -1)}
          onPlus={() => onUpdate(item.id, 'clean_count', +1)}
        />
        <Counter
          label="Dirty"
          value={item.dirty_count}
          color="var(--color-amber)"
          onMinus={() => onUpdate(item.id, 'dirty_count', -1)}
          onPlus={() => onUpdate(item.id, 'dirty_count', +1)}
        />
        <Counter
          label="Wash"
          value={item.washing_count}
          color="var(--color-blue)"
          onMinus={() => onUpdate(item.id, 'washing_count', -1)}
          onPlus={() => onUpdate(item.id, 'washing_count', +1)}
        />
      </div>
    </div>
  )
}

function Counter({
  label,
  value,
  color,
  onMinus,
  onPlus,
}: {
  label: string
  value: number
  color: string
  onMinus: () => void
  onPlus: () => void
}) {
  return (
    <div className="fg-counter">
      <span className="fg-counter-label" style={{ color }}>
        {label}
      </span>
      <button
        type="button"
        onClick={onMinus}
        disabled={value === 0}
        className="fg-counter-btn"
        aria-label={`Decrease ${label}`}
      >
        −
      </button>
      <span className="fg-counter-value" style={{ color }}>
        {value}
      </span>
      <button
        type="button"
        onClick={onPlus}
        className="fg-counter-btn"
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
  )
}

'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import Link from 'next/link'
import TaskRow from './TaskRow'
import ReportIssueButton from '../issues/ReportIssueButton'
import OneshotList, { type OneshotTask } from '../oneshots/OneshotList'
import PostOneshotButton from '../oneshots/PostOneshotButton'
import { floorLabel } from '@/lib/floors'
import {
  markTaskComplete,
  undoTaskComplete,
  saveRoomOrder,
} from './actions'
import { togglePrearrivalCheck } from '../house/actions'

// ─── Types ────────────────────────────────────────────────────────────

type DueTask = {
  id: string
  name: string
  notes: string | null
  frequency_days: number | null
  is_turnaround: boolean
  task_kind: 'turnover' | 'recurring' | 'occupied_only'
  room_id: string
  room_name: string
  floor: number
  room_type: string
  last_completed_date: string | null
  room_state: 'occupied' | 'just_vacated' | 'idle'
  status: 'overdue' | 'due' | 'scheduled' | 'turnaround' | 'no_schedule'
  days_overdue: number | null
}

type Completion = {
  id: string
  completed_at: string
  completed_by: string | null
  task_template_id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  task_templates: any
}

type Room = {
  id: string
  name: string
  floor: number
  room_type: string
}

type RoomOrderRow = { room_id: string; position: number }

type Profile = { id: string; full_name: string; role: string }

type SortMode = 'most_due' | 'custom'

// ─── Visual constants ─────────────────────────────────────────────────

const TYPE_META: Record<string, { icon: string }> = {
  bedroom:  { icon: '🛏' },
  bathroom: { icon: '🛁' },
  kitchen:  { icon: '🍳' },
  dining:   { icon: '🍽' },
  living:   { icon: '🛋' },
  utility:  { icon: '🧺' },
  common:   { icon: '↗' },
  global:   { icon: '🏠' },
}

// ─── Toast (local; replaces UndoToast which used URL params) ──────────

function Toast({
  message,
  onUndo,
  onDismiss,
}: {
  message: string
  onUndo?: () => void
  onDismiss: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <div className="fg-toast" role="status" aria-live="polite">
      <span>{message}</span>
      {onUndo && (
        <button type="button" onClick={onUndo} className="fg-toast-undo">
          Undo
        </button>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────

export default function HousekeepingClient({
  dueTasks: initialDueTasks,
  completions: initialCompletions,
  rooms,
  roomOrder,
  openIssuesCount,
  prearrivalByRoom,
  oneshotTasks,
  oneshotTasksEnabled,
  profile,
  activeRoomId,
  errorMessage,
}: {
  dueTasks: DueTask[]
  completions: Completion[]
  rooms: Room[]
  roomOrder: RoomOrderRow[]
  openIssuesCount: Record<string, number>
  prearrivalByRoom: Record<
    string,
    {
      request_id: string
      check_in: string
      check_out: string
      guest_label: string
      templates: { id: string; name: string; position: number }[]
      checkedTemplateIds: string[]
    }
  >
  oneshotTasks: OneshotTask[]
  oneshotTasksEnabled: boolean
  profile: Profile
  activeRoomId: string | null
  errorMessage: string | null
}) {
  const canTick = profile.role === 'admin' || profile.role === 'cleaner'

  // ─── Live tickable state ───────────────────────────────────────
  // Held in client state so optimistic ticks don't require a refetch.
  const [dueTasks, setDueTasks] = useState<DueTask[]>(initialDueTasks)
  const [completions, setCompletions] = useState<Completion[]>(initialCompletions)
  const [toast, setToast] = useState<{
    message: string
    completionId: string | null
    snapshot: { task: DueTask; completion: Completion } | null
  } | null>(null)

  // Re-sync if server props change (rare — happens on hard nav)
  useEffect(() => { setDueTasks(initialDueTasks) }, [initialDueTasks])
  useEffect(() => { setCompletions(initialCompletions) }, [initialCompletions])

  // ─── Sort mode state ───────────────────────────────────────────
  const [sortMode, setSortMode] = useState<SortMode>(
    roomOrder.length > 0 ? 'custom' : 'most_due'
  )

  // The user's customised order, mutable in client state. When sortMode
  // is 'custom' and this list is empty, we seed from the server-provided
  // order; if that's empty, we seed from current most-due ordering.
  const [customOrder, setCustomOrder] = useState<string[]>(() =>
    roomOrder.map((r) => r.room_id)
  )
  const [, startSaveTransition] = useTransition()

  // ─── Group due tasks and completions by room ─────────────────────────
  const dueByRoom = useMemo(() => {
    const m = new Map<string, DueTask[]>()
    for (const t of dueTasks) {
      if (!m.has(t.room_id)) m.set(t.room_id, [])
      m.get(t.room_id)!.push(t)
    }
    return m
  }, [dueTasks])

  const completionsByRoom = useMemo(() => {
    const m = new Map<string, Completion[]>()
    for (const c of completions) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const roomId = (c.task_templates as any)?.room_id
      if (!roomId) continue
      if (!m.has(roomId)) m.set(roomId, [])
      m.get(roomId)!.push(c)
    }
    return m
  }, [completions])

  // ─── Visible rooms ───────────────────────────────────────────────────
  // When a chip is active → just that room. Otherwise → rooms with due
  // tasks or completions today (skip empty ones in 'most_due' mode).
  // 'custom' mode shows ALL rooms so the user can drag any of them.
  const visibleRooms: Room[] = useMemo(() => {
    let candidates = rooms
    if (activeRoomId) {
      candidates = rooms.filter((r) => r.id === activeRoomId)
    } else if (sortMode === 'most_due') {
      candidates = rooms.filter(
        (r) => dueByRoom.has(r.id) || completionsByRoom.has(r.id)
      )
    }
    // In custom mode we keep ALL rooms.
    return candidates
  }, [rooms, dueByRoom, completionsByRoom, activeRoomId, sortMode])

  // ─── Most-to-do sort: SNAPSHOT not live ─────────────────────────────
  // Sorting "by most due" needs to be stable while you tick tasks off,
  // otherwise rooms jump around mid-clean. We capture a snapshot of the
  // ranking at the moment the user enters most_due mode (or refreshes
  // their snapshot via the "Re-sort" button), and use that frozen order
  // for layout. Live counts only feed the badges, not the sort.
  const buildSnapshot = (): Map<string, number> => {
    // Compute the "most due" ranking right now. Each room gets an integer
    // position, lower = higher in the list.
    const ranked = [...rooms].sort((a, b) => {
      const da = dueByRoom.get(a.id)?.length ?? 0
      const db = dueByRoom.get(b.id)?.length ?? 0
      if (db !== da) return db - da
      return a.name.localeCompare(b.name)
    })
    const m = new Map<string, number>()
    ranked.forEach((r, i) => m.set(r.id, i))
    return m
  }

  const [mostDueSnapshot, setMostDueSnapshot] = useState<Map<string, number>>(
    () => buildSnapshot()
  )

  // If the user is in custom mode and switches to most_due, rebuild the
  // snapshot. We don't want to rebuild while *staying* in most_due,
  // because that's the whole point — keep it frozen.
  // (Custom mode → most_due triggers a fresh snapshot via switchToMostDue.)

  // Stale detection: compare live ranking to snapshot. If they differ,
  // show the user a "Re-sort" affordance.
  const snapshotStale = useMemo(() => {
    if (sortMode !== 'most_due') return false
    // Build a quick live-ranking lookup
    const live = buildSnapshot()
    // If any room's snapshot position differs from its live position,
    // the snapshot is stale.
    for (const [rid, livePos] of live.entries()) {
      const snapPos = mostDueSnapshot.get(rid)
      if (snapPos === undefined) return true
      if (snapPos !== livePos) return true
    }
    return false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, dueByRoom, rooms, mostDueSnapshot])

  const resortNow = () => {
    setMostDueSnapshot(buildSnapshot())
  }

  // ─── Group visible rooms by floor ─────────────────────────────────────
  // Floors are always grouped, regardless of sort mode. Within a floor
  // the order is determined by sortMode.
  const roomsByFloor = useMemo(() => {
    const m = new Map<number, Room[]>()
    for (const r of visibleRooms) {
      if (!m.has(r.floor)) m.set(r.floor, [])
      m.get(r.floor)!.push(r)
    }

    // Sort the rooms inside each floor according to sortMode
    for (const [floor, list] of m.entries()) {
      if (sortMode === 'most_due') {
        // Use the FROZEN snapshot, not the live count.
        list.sort((a, b) => {
          const pa = mostDueSnapshot.get(a.id) ?? Number.MAX_SAFE_INTEGER
          const pb = mostDueSnapshot.get(b.id) ?? Number.MAX_SAFE_INTEGER
          if (pa !== pb) return pa - pb
          return a.name.localeCompare(b.name)
        })
      } else {
        // Custom: respect customOrder; rooms not in customOrder get
        // appended alphabetically at the end of their floor.
        const posIndex = new Map<string, number>()
        customOrder.forEach((rid, i) => posIndex.set(rid, i))
        list.sort((a, b) => {
          const pa = posIndex.get(a.id)
          const pb = posIndex.get(b.id)
          if (pa !== undefined && pb !== undefined) return pa - pb
          if (pa !== undefined) return -1
          if (pb !== undefined) return 1
          return a.name.localeCompare(b.name)
        })
      }
      m.set(floor, list)
    }
    return m
  }, [visibleRooms, sortMode, mostDueSnapshot, customOrder])

  const orderedFloors = useMemo(
    () => Array.from(roomsByFloor.keys()).sort((a, b) => b - a),
    [roomsByFloor]
  )

  // ─── Accordion expansion state ───────────────────────────────────────
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(() =>
    activeRoomId ? new Set([activeRoomId]) : new Set()
  )
  useEffect(() => {
    if (activeRoomId) {
      setExpandedRooms((prev) => {
        if (prev.has(activeRoomId)) return prev
        const next = new Set(prev)
        next.add(activeRoomId)
        return next
      })
    }
  }, [activeRoomId])

  const toggleRoom = (roomId: string) => {
    setExpandedRooms((prev) => {
      const next = new Set(prev)
      if (next.has(roomId)) next.delete(roomId)
      else next.add(roomId)
      return next
    })
  }

  // ─── Stats ──────────────────────────────────────────────────────────
  const overdueCount = dueTasks.filter((t) => t.status === 'overdue').length
  const dueTodayCount = dueTasks.filter((t) => t.status === 'due').length
  const totalDueCount = dueTasks.length
  const completedCount = completions.length

  // ─── Chip strip ─────────────────────────────────────────────────────
  const chipRooms = useMemo(() => {
    return rooms
      .filter((r) => dueByRoom.has(r.id))
      .map((r) => ({ ...r, count: dueByRoom.get(r.id)!.length }))
      .sort((a, b) => b.count - a.count)
  }, [rooms, dueByRoom])

  const dateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  // ─── Tick handlers (optimistic, no router.refresh) ────────────────────
  const handleTick = (task: DueTask) => {
    if (!canTick) return

    // Snapshot for undo
    const snapshot = { ...task }

    // Optimistic local mutation: remove from dueTasks
    setDueTasks((prev) => prev.filter((t) => t.id !== task.id))

    // Fire the server action
    ;(async () => {
      const result = await markTaskComplete(task.id)
      if (result.error || !result.completionId) {
        // Roll back
        setDueTasks((prev) => [snapshot, ...prev])
        setToast({
          message: result.error || 'Could not complete task',
          completionId: null,
          snapshot: null,
        })
        return
      }

      // Build a synthetic completion object so it shows in "Completed today"
      const room = rooms.find((r) => r.id === task.room_id)
      const newCompletion: Completion = {
        id: result.completionId,
        completed_at: new Date().toISOString(),
        completed_by: profile.id,
        task_template_id: task.id,
        task_templates: {
          id: task.id,
          name: task.name,
          room_id: task.room_id,
          rooms: room ? { id: room.id, name: room.name } : null,
        },
      }
      setCompletions((prev) => [newCompletion, ...prev])

      setToast({
        message: '✓ Marked complete',
        completionId: result.completionId,
        snapshot: { task: snapshot, completion: newCompletion },
      })
    })()
  }

  const handleUndo = () => {
    if (!toast?.completionId || !toast?.snapshot) {
      setToast(null)
      return
    }
    const completionId = toast.completionId
    const { task, completion } = toast.snapshot

    // Optimistic: put the task back, remove the completion
    setDueTasks((prev) => [task, ...prev])
    setCompletions((prev) => prev.filter((c) => c.id !== completion.id))
    setToast(null)

    ;(async () => {
      const result = await undoTaskComplete(completionId)
      if (result.error) {
        // Roll back the rollback (this is rare)
        setDueTasks((prev) => prev.filter((t) => t.id !== task.id))
        setCompletions((prev) => [completion, ...prev])
        setToast({
          message: result.error,
          completionId: null,
          snapshot: null,
        })
      }
    })()
  }

  // ─── Sort mode toggle ────────────────────────────────────────────────
  const switchToCustom = () => {
    setSortMode('custom')
    // Seed customOrder with current visible order if we don't have one yet
    if (customOrder.length === 0) {
      const seeded: string[] = []
      for (const floor of orderedFloors) {
        for (const r of roomsByFloor.get(floor) ?? []) {
          seeded.push(r.id)
        }
      }
      setCustomOrder(seeded)
      // Persist (silent)
      startSaveTransition(async () => {
        await saveRoomOrder(seeded)
      })
    }
  }
  const switchToMostDue = () => {
    // Rebuild snapshot so we order by current counts at the moment of switch.
    setMostDueSnapshot(buildSnapshot())
    setSortMode('most_due')
  }
  const resetCustom = () => {
    if (
      !window.confirm(
        'Reset to default ordering? Your custom layout will be lost.'
      )
    )
      return
    setCustomOrder([])
    setMostDueSnapshot(buildSnapshot())
    setSortMode('most_due')
    startSaveTransition(async () => {
      await saveRoomOrder([])
    })
  }

  // ─── Drag-to-reorder ──────────────────────────────────────────────────
  // Pointer-events drag, only active in custom mode. Reorder within the
  // same floor only (cross-floor reorders would break the floor groupings).
  const [drag, setDrag] = useState<{
    roomId: string
    name: string
    floor: number
    x: number
    y: number
  } | null>(null)
  const [hoverIndex, setHoverIndex] = useState<{
    floor: number
    insertAtRoomId: string
  } | null>(null)

  function handleDragStart(
    e: React.PointerEvent,
    room: Room
  ) {
    if (sortMode !== 'custom') return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    setDrag({
      roomId: room.id,
      name: room.name,
      floor: room.floor,
      x: e.clientX,
      y: e.clientY,
    })
  }

  function handleDragMove(e: React.PointerEvent) {
    if (!drag) return
    e.preventDefault()
    setDrag((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev))

    const stack = document.elementsFromPoint(e.clientX, e.clientY)
    let foundCard: HTMLElement | null = null
    for (const el of stack) {
      if (el instanceof HTMLElement && el.dataset.roomCard) {
        foundCard = el
        break
      }
    }
    if (
      foundCard?.dataset.roomId &&
      foundCard?.dataset.floor !== undefined &&
      Number(foundCard.dataset.floor) === drag.floor &&
      foundCard.dataset.roomId !== drag.roomId
    ) {
      setHoverIndex({
        floor: drag.floor,
        insertAtRoomId: foundCard.dataset.roomId,
      })
    } else {
      setHoverIndex(null)
    }
  }

  function handleDragEnd(e: React.PointerEvent) {
    if (!drag) return
    const target = e.currentTarget as HTMLElement
    try { target.releasePointerCapture(e.pointerId) } catch { /* ignore */ }

    const movingId = drag.roomId
    const insertBeforeId = hoverIndex?.insertAtRoomId ?? null

    setDrag(null)
    setHoverIndex(null)

    if (!insertBeforeId) return

    // Build the new customOrder: move `movingId` to be immediately before
    // `insertBeforeId`, preserving all others.
    setCustomOrder((prev) => {
      // Make sure the current full set of room IDs (in their current sorted
      // order) is the basis — this ensures rooms not yet in the saved order
      // get included.
      const currentFullOrder: string[] = []
      for (const floor of orderedFloors) {
        for (const r of roomsByFloor.get(floor) ?? []) {
          currentFullOrder.push(r.id)
        }
      }
      const without = currentFullOrder.filter((id) => id !== movingId)
      const idx = without.indexOf(insertBeforeId)
      if (idx === -1) return prev
      const next = [...without.slice(0, idx), movingId, ...without.slice(idx)]

      // Persist
      startSaveTransition(async () => {
        await saveRoomOrder(next)
      })
      return next
    })
  }

  function handleDragCancel(e: React.PointerEvent) {
    if (!drag) return
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    setDrag(null)
    setHoverIndex(null)
  }

  // Lock body scroll while dragging
  useEffect(() => {
    if (drag) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [drag])

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <p
          className="fg-section-label mb-1"
          style={{ color: 'var(--color-gold)' }}
        >
          {dateStr}
        </p>
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <h1
            className="text-3xl md:text-4xl"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            Housekeeping
          </h1>
          {profile.role === 'admin' && (
            <div className="flex items-center gap-2 flex-wrap">
              {oneshotTasksEnabled && <PostOneshotButton rooms={rooms} />}
              <Link
                href="/admin/rooms"
                className="fg-btn-ghost text-xs"
                style={{ width: 'auto' }}
              >
                Manage tasks →
              </Link>
            </div>
          )}
        </div>
        <p
          className="text-sm fg-mono mt-2"
          style={{ color: 'var(--color-muted)' }}
        >
          {totalDueCount === 0 && completedCount === 0 ? (
            <span style={{ color: 'var(--color-green)' }}>
              Nothing due today.
            </span>
          ) : (
            <>
              {overdueCount > 0 && (
                <span style={{ color: 'var(--color-red)' }}>
                  {overdueCount} overdue
                </span>
              )}
              {overdueCount > 0 && dueTodayCount > 0 && ' · '}
              {dueTodayCount > 0 && <>{dueTodayCount} due today</>}
              {(overdueCount > 0 || dueTodayCount > 0) &&
                completedCount > 0 &&
                ' · '}
              {completedCount > 0 && (
                <span style={{ color: 'var(--color-green)' }}>
                  {completedCount} done today
                </span>
              )}
            </>
          )}
        </p>
      </div>

      {/* Sort-mode toggle */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span
          className="fg-section-label"
          style={{ color: 'var(--color-muted)' }}
        >
          Sort:
        </span>
        <button
          type="button"
          onClick={switchToMostDue}
          className={`fg-chip${sortMode === 'most_due' ? ' fg-chip-active' : ''}`}
          aria-pressed={sortMode === 'most_due'}
        >
          Most to do
        </button>
        <button
          type="button"
          onClick={switchToCustom}
          className={`fg-chip${sortMode === 'custom' ? ' fg-chip-active' : ''}`}
          aria-pressed={sortMode === 'custom'}
        >
          ⋮⋮ Custom
        </button>
        {sortMode === 'most_due' && snapshotStale && (
          <button
            type="button"
            onClick={resortNow}
            className="fg-chip"
            style={{
              color: 'var(--color-gold)',
              borderColor: 'rgba(168, 134, 46, 0.4)',
            }}
            title="Re-rank rooms by current due counts"
          >
            ↻ Re-sort
          </button>
        )}
        {sortMode === 'custom' && customOrder.length > 0 && (
          <button
            type="button"
            onClick={resetCustom}
            className="fg-chip"
            style={{ color: 'var(--color-muted)' }}
            title="Reset custom order"
          >
            Reset
          </button>
        )}
        {sortMode === 'custom' && (
          <span
            className="text-xs fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            Drag a room to reorder within its floor.
          </span>
        )}
      </div>

      {/* Filter chips */}
      {chipRooms.length > 0 && (
        <div className="fg-chip-strip mb-5">
          <Link
            href="/housekeeping"
            scroll={false}
            className={`fg-chip${!activeRoomId ? ' fg-chip-active' : ''}`}
          >
            All · {totalDueCount}
          </Link>
          {chipRooms.map((r) => (
            <Link
              key={r.id}
              href={`/housekeeping?room=${r.id}`}
              scroll={false}
              className={`fg-chip${
                activeRoomId === r.id ? ' fg-chip-active' : ''
              }`}
            >
              {r.name} · {r.count}
            </Link>
          ))}
        </div>
      )}

      {errorMessage && <div className="fg-msg-error mb-4">{errorMessage}</div>}

      {/* v23: One-shot tasks — admin-posted ad-hoc tasks above the rota */}
      {oneshotTasksEnabled && (
        <OneshotList
          tasks={oneshotTasks}
          isAdmin={profile.role === 'admin'}
          currentUserId={profile.id}
        />
      )}

      {/* Empty state */}
      {totalDueCount === 0 && completedCount === 0 && sortMode === 'most_due' && (
        <div className="fg-card p-8 text-center mt-6">
          <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
          <p
            className="text-base mb-2"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
          >
            Nothing due today
          </p>
          <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
            Tasks will appear here when they need doing.
          </p>
        </div>
      )}

      {/* Floor groups */}
      {orderedFloors.map((floor) => {
        const floorRooms = roomsByFloor.get(floor) ?? []
        return (
          <section key={floor} className="fg-floor-group">
            <h2 className="fg-floor-heading">
              {floorLabel(floor)}
            </h2>
            <div className="space-y-3">
              {floorRooms.map((room) => {
                const isHoverTarget =
                  hoverIndex?.floor === floor &&
                  hoverIndex?.insertAtRoomId === room.id

                return (
                  <RoomAccordion
                    key={room.id}
                    room={room}
                    floor={floor}
                    dueTasks={dueByRoom.get(room.id) ?? []}
                    completions={completionsByRoom.get(room.id) ?? []}
                    openIssueCount={openIssuesCount[room.id] ?? 0}
                    prearrival={prearrivalByRoom[room.id] ?? null}
                    isExpanded={expandedRooms.has(room.id)}
                    onToggle={() => toggleRoom(room.id)}
                    canTick={canTick}
                    sortMode={sortMode}
                    isDragging={drag?.roomId === room.id}
                    isHoverTarget={isHoverTarget}
                    onTick={handleTick}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                  />
                )
              })}
            </div>
          </section>
        )
      })}

      {/* Drag ghost */}
      {drag && (
        <div
          className="fg-room-ghost"
          style={{ left: drag.x, top: drag.y }}
          aria-hidden
        >
          {drag.name}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          onUndo={toast.completionId ? handleUndo : undefined}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  )
}

// ─── Room accordion ─────────────────────────────────────────────────────

function RoomAccordion({
  room,
  floor,
  dueTasks,
  completions,
  openIssueCount,
  prearrival,
  isExpanded,
  onToggle,
  canTick,
  sortMode,
  isDragging,
  isHoverTarget,
  onTick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: {
  room: Room
  floor: number
  dueTasks: DueTask[]
  completions: Completion[]
  openIssueCount: number
  prearrival: {
    request_id: string
    check_in: string
    check_out: string
    guest_label: string
    templates: { id: string; name: string; position: number }[]
    checkedTemplateIds: string[]
  } | null
  isExpanded: boolean
  onToggle: () => void
  canTick: boolean
  sortMode: SortMode
  isDragging: boolean
  isHoverTarget: boolean
  onTick: (task: DueTask) => void
  onDragStart: (e: React.PointerEvent, room: Room) => void
  onDragMove: (e: React.PointerEvent) => void
  onDragEnd: (e: React.PointerEvent) => void
  onDragCancel: (e: React.PointerEvent) => void
}) {
  const dueCount = dueTasks.length
  const doneCount = completions.length
  const meta = TYPE_META[room.room_type] ?? { icon: '🏠' }
  const prearrivalUnchecked = prearrival
    ? prearrival.templates.length - prearrival.checkedTemplateIds.length
    : 0

  return (
    <div
      data-room-card="1"
      data-room-id={room.id}
      data-floor={floor}
      className={[
        'fg-room-card',
        isDragging ? 'is-dragging' : '',
        isHoverTarget ? 'is-drop-target' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="fg-room-header-wrap">
        {sortMode === 'custom' && (
          <div
            className="fg-room-handle"
            onPointerDown={(e) => onDragStart(e, room)}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragCancel}
            title="Drag to reorder"
            aria-label={`Drag ${room.name}`}
          >
            ⋮⋮
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="fg-room-header"
          aria-expanded={isExpanded}
        >
          <span
            className={`fg-room-chevron${isExpanded ? ' is-open' : ''}`}
            aria-hidden
          >
            ▸
          </span>
          <span style={{ fontSize: 20, marginRight: 4 }}>{meta.icon}</span>
          <span className="fg-room-name">{room.name}</span>
          <span className="fg-room-counts">
            {prearrival && prearrivalUnchecked > 0 && (
              <span className="fg-room-prearrival-pill">
                🛎 {prearrivalUnchecked} prep
              </span>
            )}
            {openIssueCount > 0 && (
              <span className="fg-room-issue-pill">
                ⚠ {openIssueCount}
              </span>
            )}
            {dueCount > 0 && (
              <span className="fg-room-badge fg-room-badge-due">
                {dueCount} due
              </span>
            )}
            {doneCount > 0 && (
              <span className="fg-room-badge fg-room-badge-done">
                {doneCount} done
              </span>
            )}
          </span>
        </button>
      </div>

      {isExpanded && (
        <div className="fg-room-body">
          {prearrival && (
            <PrearrivalSection
              roomId={room.id}
              prearrival={prearrival}
              canTick={canTick}
            />
          )}

          {dueTasks.length > 0 && (
            <div className="space-y-2 px-3 py-3">
              {dueTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  taskId={task.id}
                  name={task.name}
                  notes={task.notes}
                  status={task.status}
                  daysOverdue={task.days_overdue}
                  frequencyDays={task.frequency_days}
                  taskKind={task.task_kind ?? 'recurring'}
                  canTick={canTick}
                  onTick={() => onTick(task)}
                />
              ))}
            </div>
          )}

          {completions.length > 0 && (
            <CompletedSection completions={completions} />
          )}

          {dueTasks.length === 0 && completions.length === 0 && (
            <p
              className="text-xs fg-mono text-center py-6"
              style={{ color: 'var(--color-muted)' }}
            >
              No tasks needed in this room today.
            </p>
          )}

          {/* Report-issue link — discreet, lives at the bottom of the body */}
          <div
            className="px-3 pb-3 pt-1 flex justify-end"
            style={{ borderTop: '1px solid var(--color-warm)' }}
          >
            <ReportIssueButton roomId={room.id} roomName={room.name} />
          </div>
        </div>
      )}
    </div>
  )
}

function CompletedSection({ completions }: { completions: Completion[] }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="fg-completed-section">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="fg-completed-header"
        aria-expanded={expanded}
      >
        <span className={`fg-room-chevron${expanded ? ' is-open' : ''}`} aria-hidden>
          ▸
        </span>
        <span>Completed today</span>
        <span className="fg-completed-count">{completions.length}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-1">
          {completions.map((c) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const taskName = (c.task_templates as any)?.name ?? '(deleted task)'
            const time = new Date(c.completed_at).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })
            return (
              <div key={c.id} className="fg-completed-row">
                <span className="fg-completed-check" aria-hidden>
                  ✓
                </span>
                <span className="fg-completed-name">{taskName}</span>
                <span className="fg-completed-time">{time}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ───── Prearrival prep section, sits inside a room body ─────────────
function PrearrivalSection({
  roomId,
  prearrival,
  canTick,
}: {
  roomId: string
  prearrival: {
    request_id: string
    check_in: string
    check_out: string
    guest_label: string
    templates: { id: string; name: string; position: number }[]
    checkedTemplateIds: string[]
  }
  canTick: boolean
}) {
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Optimistic local set of checked ids — server is source of truth on
  // refresh, but we update immediately so the cleaner gets feedback.
  const [optimisticChecked, setOptimisticChecked] = useState<Set<string>>(
    () => new Set(prearrival.checkedTemplateIds),
  )
  // Re-sync if server-provided ids change (e.g. on revalidate)
  useEffect(() => {
    setOptimisticChecked(new Set(prearrival.checkedTemplateIds))
  }, [prearrival.checkedTemplateIds])

  const checkInDate = new Date(prearrival.check_in + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysUntil = Math.round(
    (checkInDate.getTime() - today.getTime()) / 86400000,
  )
  const arrivalLabel =
    daysUntil === 0
      ? 'today'
      : daysUntil === 1
        ? 'tomorrow'
        : `in ${daysUntil} days`
  const dateLabel = checkInDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  const completedCount = optimisticChecked.size
  const totalCount = prearrival.templates.length

  async function handleToggle(templateId: string) {
    if (!canTick) return
    setError(null)
    const wasChecked = optimisticChecked.has(templateId)
    const next = new Set(optimisticChecked)
    if (wasChecked) next.delete(templateId)
    else next.add(templateId)
    setOptimisticChecked(next)
    setBusyId(templateId)

    const result = await togglePrearrivalCheck(
      prearrival.request_id,
      templateId,
      roomId,
      !wasChecked,
    )
    setBusyId(null)
    if (result?.error) {
      // Roll back optimistic state on failure
      const rolled = new Set(optimisticChecked)
      if (wasChecked) rolled.add(templateId)
      else rolled.delete(templateId)
      setOptimisticChecked(rolled)
      setError(result.error)
      return
    }
    startTransition(() => {
      // Server data will refresh with revalidatePath; nothing to do here.
    })
  }

  return (
    <div className="fg-prearrival-section">
      <div className="fg-prearrival-header">
        <div>
          <div className="fg-prearrival-title">
            🛎 Prep for {prearrival.guest_label}
          </div>
          <div className="fg-prearrival-meta">
            arriving {arrivalLabel} · {dateLabel} · {completedCount} of{' '}
            {totalCount} done
          </div>
        </div>
      </div>
      {error && (
        <div className="fg-msg-error" style={{ margin: '8px 0' }}>
          {error}
        </div>
      )}
      <div className="fg-prearrival-list">
        {prearrival.templates
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((t) => {
            const isChecked = optimisticChecked.has(t.id)
            return (
              <label key={t.id} className="fg-prearrival-row">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleToggle(t.id)}
                  disabled={!canTick || busyId === t.id}
                />
                <span className={isChecked ? 'is-done' : ''}>{t.name}</span>
              </label>
            )
          })}
      </div>
    </div>
  )
}

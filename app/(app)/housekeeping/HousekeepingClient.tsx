'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import TaskRow from './TaskRow'
import UndoToast from './UndoToast'

type DueTask = {
  id: string
  name: string
  notes: string | null
  frequency_days: number | null
  is_turnaround: boolean
  room_id: string
  room_name: string
  floor: number
  room_type: string
  last_completed_date: string | null
  status: 'overdue' | 'due' | 'scheduled' | 'turnaround' | 'no_schedule'
  days_overdue: number | null
}

type Completion = {
  id: string
  completed_at: string
  completed_by: string | null
  task_template_id: string
  task_templates: any // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Room = {
  id: string
  name: string
  floor: number
  room_type: string
}

type Profile = { id: string; full_name: string; role: string }

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

export default function HousekeepingClient({
  dueTasks,
  completions,
  rooms,
  profile,
  activeRoomId,
  doneCompletionId,
  errorMessage,
}: {
  dueTasks: DueTask[]
  completions: Completion[]
  rooms: Room[]
  profile: Profile
  activeRoomId: string | null
  doneCompletionId: string | null
  errorMessage: string | null
}) {
  const canTick = profile.role === 'admin' || profile.role === 'cleaner'

  // Group due tasks and completions by room
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
      const roomId = (c.task_templates as any)?.room_id
      if (!roomId) continue
      if (!m.has(roomId)) m.set(roomId, [])
      m.get(roomId)!.push(c)
    }
    return m
  }, [completions])

  // Visible rooms: when a chip is active → just that room. Otherwise →
  // any room with due tasks OR completions today (skip empty rooms).
  const visibleRooms = useMemo(() => {
    let candidates = rooms
    if (activeRoomId) {
      candidates = rooms.filter((r) => r.id === activeRoomId)
    } else {
      candidates = rooms.filter(
        (r) => dueByRoom.has(r.id) || completionsByRoom.has(r.id)
      )
    }
    return candidates.sort((a, b) => {
      const dueA = dueByRoom.get(a.id)?.length ?? 0
      const dueB = dueByRoom.get(b.id)?.length ?? 0
      return dueB - dueA
    })
  }, [rooms, dueByRoom, completionsByRoom, activeRoomId])

  // Accordion expansion state
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(() =>
    activeRoomId ? new Set([activeRoomId]) : new Set()
  )

  // When the user clicks a chip and the URL's `room` param changes,
  // make sure the filtered room is expanded so they see the tasks.
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

  // Stats for the header strip
  const overdueCount = dueTasks.filter((t) => t.status === 'overdue').length
  const dueTodayCount = dueTasks.filter((t) => t.status === 'due').length
  const totalDueCount = dueTasks.length
  const completedCount = completions.length

  // Chip strip: only rooms that have due tasks
  const chipRooms = useMemo(() => {
    return rooms
      .filter((r) => dueByRoom.has(r.id))
      .map((r) => ({ ...r, count: dueByRoom.get(r.id)!.length }))
      .sort((a, b) => b.count - a.count)
  }, [rooms, dueByRoom])

  // For UI date string
  const dateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div>
      {/* ─── Header ─── */}
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
            <Link
              href="/admin/rooms"
              className="fg-btn-ghost text-xs"
              style={{ width: 'auto' }}
            >
              Manage tasks →
            </Link>
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

      {/* ─── Filter chips ─── */}
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

      {/* ─── Error message ─── */}
      {errorMessage && <div className="fg-msg-error mb-4">{errorMessage}</div>}

      {/* ─── Empty state ─── */}
      {totalDueCount === 0 && completedCount === 0 && (
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

      {/* ─── Room accordion ─── */}
      <div className="space-y-3">
        {visibleRooms.map((room) => (
          <RoomAccordion
            key={room.id}
            room={room}
            dueTasks={dueByRoom.get(room.id) ?? []}
            completions={completionsByRoom.get(room.id) ?? []}
            isExpanded={expandedRooms.has(room.id)}
            onToggle={() => toggleRoom(room.id)}
            canTick={canTick}
          />
        ))}
      </div>

      {/* ─── Toast ─── */}
      {doneCompletionId && <UndoToast completionId={doneCompletionId} />}
    </div>
  )
}

function RoomAccordion({
  room,
  dueTasks,
  completions,
  isExpanded,
  onToggle,
  canTick,
}: {
  room: Room
  dueTasks: DueTask[]
  completions: Completion[]
  isExpanded: boolean
  onToggle: () => void
  canTick: boolean
}) {
  const dueCount = dueTasks.length
  const doneCount = completions.length
  const meta = TYPE_META[room.room_type] ?? { icon: '🏠' }

  return (
    <div className="fg-room-card">
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

      {isExpanded && (
        <div className="fg-room-body">
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
                  canTick={canTick}
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

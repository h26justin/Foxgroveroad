import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import TaskRow from './TaskRow'
import UndoToast from './UndoToast'

export const revalidate = 0 // always fresh — completions matter in real time

const TYPE_META: Record<string, { icon: string; color: string }> = {
  bedroom: { icon: '🛏', color: 'var(--color-blue)' },
  bathroom: { icon: '🛁', color: 'var(--color-blue)' },
  kitchen: { icon: '🍳', color: 'var(--color-amber)' },
  dining: { icon: '🍽', color: 'var(--color-amber)' },
  living: { icon: '🛋', color: 'var(--color-green)' },
  utility: { icon: '🧺', color: 'var(--color-muted)' },
  common: { icon: '↗', color: 'var(--color-muted)' },
  global: { icon: '🏠', color: 'var(--color-gold)' },
}

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

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; undone?: string; error?: string }>
}) {
  const profile = await requireProfile()
  const sp = await searchParams
  const supabase = await createClient()

  // Pull all due/overdue tasks from the view.
  const { data: dueRowsRaw, error } = await supabase
    .from('cleaner_tasks_today')
    .select(
      'id, name, notes, frequency_days, is_turnaround, room_id, room_name, floor, room_type, last_completed_date, status, days_overdue'
    )
    .in('status', ['overdue', 'due'])
    .order('days_overdue', { ascending: false })
    .order('room_name', { ascending: true })

  const dueRows: DueTask[] = (dueRowsRaw as any[]) ?? []

  // Group by room
  const byRoom = new Map<string, { roomName: string; roomType: string; floor: number; tasks: DueTask[] }>()
  for (const t of dueRows) {
    if (!byRoom.has(t.room_id)) {
      byRoom.set(t.room_id, {
        roomName: t.room_name,
        roomType: t.room_type,
        floor: t.floor,
        tasks: [],
      })
    }
    byRoom.get(t.room_id)!.tasks.push(t)
  }

  // Sort rooms: keep most-overdue rooms first
  const rooms = Array.from(byRoom.entries()).sort((a, b) => {
    const maxA = Math.max(...a[1].tasks.map((t) => t.days_overdue ?? -999))
    const maxB = Math.max(...b[1].tasks.map((t) => t.days_overdue ?? -999))
    return maxB - maxA
  })

  // Today's date string for the header
  const today = new Date()
  const dateStr = today.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  // Stats for header
  const overdueCount = dueRows.filter((t) => t.status === 'overdue').length
  const dueTodayCount = dueRows.filter((t) => t.status === 'due').length
  const totalCount = dueRows.length

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <p
          className="fg-section-label mb-1"
          style={{ color: 'var(--color-gold)' }}
        >
          {dateStr}
        </p>
        <h1
          className="text-3xl md:text-4xl mb-3"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
        >
          Today
        </h1>
        <p
          className="text-sm fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          {totalCount === 0 ? (
            <span style={{ color: 'var(--color-green)' }}>
              Nothing due today. Nicely done.
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
              {' · '}
              {totalCount} total
            </>
          )}
        </p>
      </div>

      {/* Status messages from server actions */}
      {sp.error && <div className="fg-msg-error mb-4">{sp.error}</div>}

      {/* If error fetching */}
      {error && (
        <div className="fg-msg-error mb-4">
          Failed to load today's tasks: {error.message}
        </div>
      )}

      {/* Empty state */}
      {totalCount === 0 && !error && (
        <div className="fg-card p-8 text-center">
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

      {/* Task list — grouped by room */}
      {rooms.map(([roomId, group]) => {
        const meta = TYPE_META[group.roomType] ?? TYPE_META.common
        return (
          <section key={roomId} className="mb-8">
            <div className="flex items-baseline gap-2 mb-3 px-1">
              <span style={{ fontSize: 18 }}>{meta.icon}</span>
              <h2
                className="text-lg"
                style={{
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--color-ink)',
                }}
              >
                {group.roomName}
              </h2>
              <span
                className="text-xs fg-mono ml-auto"
                style={{ color: 'var(--color-muted)' }}
              >
                {group.tasks.length} task{group.tasks.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="space-y-2">
              {group.tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  taskId={t.id}
                  name={t.name}
                  notes={t.notes}
                  status={t.status}
                  daysOverdue={t.days_overdue}
                  frequencyDays={t.frequency_days}
                  canTick={profile.role === 'admin' || profile.role === 'cleaner'}
                />
              ))}
            </div>
          </section>
        )
      })}

      {/* Undo toast — reads ?done= search param and shows for 10s */}
      {sp.done && <UndoToast completionId={sp.done} />}

      {/* Brief admin nudge if nothing due AND there are no completions yet,
          to avoid Justin thinking the page is broken on first deploy. */}
      {totalCount === 0 && profile.role === 'admin' && (
        <p
          className="text-xs fg-mono text-center mt-6"
          style={{ color: 'var(--color-faint)' }}
        >
          (Admin tip: tasks become due based on their frequency. To test,
          set a task to "every day" and tomorrow it'll appear here.)
        </p>
      )}
    </div>
  )
}

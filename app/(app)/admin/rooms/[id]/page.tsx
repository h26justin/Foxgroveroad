import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createTaskTemplate } from './actions'

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
  global: { label: 'Global', icon: '🏠', color: 'var(--color-gold)' },
}

const FLOOR_LABELS: Record<number, string> = {
  2: 'Attic',
  1: 'First floor',
  0: 'Garden floor',
  [-1]: 'House (global)',
}

/**
 * Pretty-print a frequency_days int as "Every N day(s)/week(s)/month(s)".
 * Picks the largest unit that gives a clean whole number.
 */
function formatFrequency(days: number | null, isTurnaround: boolean) {
  if (isTurnaround) return 'On turnaround'
  if (days == null) return 'Not scheduled'
  if (days === 1) return 'Every day'
  if (days < 7) return `Every ${days} days`
  if (days % 30 === 0) {
    const m = days / 30
    return m === 1 ? 'Every month' : `Every ${m} months`
  }
  if (days % 7 === 0) {
    const w = days / 7
    return w === 1 ? 'Every week' : `Every ${w} weeks`
  }
  return `Every ${days} days`
}

export default async function AdminRoomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const { saved, deleted, error } = await searchParams
  const supabase = await createClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('id, name, floor, room_type, is_owner_room')
    .eq('id', id)
    .single()

  if (!room) {
    return (
      <div className="fg-card p-8 text-center">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Room not found.{' '}
          <Link
            href="/admin/rooms"
            className="underline"
            style={{ color: 'var(--color-slate)' }}
          >
            Back to rooms
          </Link>
        </p>
      </div>
    )
  }

  const { data: tasks } = await supabase
    .from('task_templates')
    .select('id, name, frequency_days, notes, is_turnaround')
    .eq('room_id', id)
    .order('is_turnaround', { ascending: true })
    .order('frequency_days', { ascending: true, nullsFirst: false })
    .order('name')

  const taskList = tasks ?? []
  const typeMeta = TYPE_META[room.room_type] ?? TYPE_META.common
  const turnaroundCount = taskList.filter((t) => t.is_turnaround).length
  const scheduledCount = taskList.length - turnaroundCount

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/rooms"
          className="text-xs fg-mono inline-flex items-center gap-1 mb-3"
          style={{ color: 'var(--color-muted)' }}
        >
          ← All rooms
        </Link>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span style={{ fontSize: 28 }}>{typeMeta.icon}</span>
          <h1
            className="text-3xl"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            {room.name}
          </h1>
        </div>
        <p
          className="text-sm fg-mono mt-2"
          style={{ color: 'var(--color-muted)' }}
        >
          {FLOOR_LABELS[room.floor] ?? `Floor ${room.floor}`} ·{' '}
          {typeMeta.label} · {taskList.length} task
          {taskList.length === 1 ? '' : 's'}
          {scheduledCount > 0 &&
            turnaroundCount > 0 &&
            ` (${scheduledCount} scheduled, ${turnaroundCount} turnaround)`}
        </p>
      </div>

      {saved && <div className="fg-msg-success mb-6">Saved.</div>}
      {deleted && <div className="fg-msg-success mb-6">Task deleted.</div>}
      {error && <div className="fg-msg-error mb-6">{error}</div>}

      {/* Add new task form */}
      <section className="mb-10">
        <h2 className="fg-section-label mb-3">Add a task</h2>
        <form action={createTaskTemplate} className="fg-card p-5 space-y-4">
          <input type="hidden" name="room_id" value={room.id} />

          <div>
            <label className="fg-label" htmlFor="new-name">
              Task name
            </label>
            <input
              id="new-name"
              name="name"
              type="text"
              required
              placeholder="e.g. Hoover Carpet"
              className="fg-input"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="fg-label" htmlFor="new-schedule-type">
                Schedule type
              </label>
              <select
                id="new-schedule-type"
                name="schedule_type"
                defaultValue="regular"
                className="fg-input"
              >
                <option value="regular">Regular</option>
                <option value="turnaround">On turnaround</option>
              </select>
            </div>
            <div>
              <label className="fg-label" htmlFor="new-freq-amount">
                Every
              </label>
              <input
                id="new-freq-amount"
                name="freq_amount"
                type="number"
                min="1"
                defaultValue="7"
                className="fg-input"
              />
            </div>
            <div>
              <label className="fg-label" htmlFor="new-freq-unit">
                Unit
              </label>
              <select
                id="new-freq-unit"
                name="freq_unit"
                defaultValue="days"
                className="fg-input"
              >
                <option value="days">days</option>
                <option value="weeks">weeks</option>
                <option value="months">months</option>
              </select>
            </div>
          </div>

          <div>
            <label className="fg-label" htmlFor="new-notes">
              Note (optional)
            </label>
            <textarea
              id="new-notes"
              name="notes"
              rows={2}
              placeholder="Special instructions, e.g. ⚠️ IMPORTANT: Use microfibre cloth only"
              className="fg-input"
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="flex justify-end">
            <button type="submit" className="fg-btn-gold">
              Add task
            </button>
          </div>
        </form>
      </section>

      {/* Task list */}
      <section>
        <h2 className="fg-section-label mb-3">
          Tasks for {room.name} ({taskList.length})
        </h2>

        {taskList.length === 0 ? (
          <div className="fg-card p-8 text-center">
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              No tasks yet for this room. Add one above to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {taskList.map((task) => (
              <Link
                key={task.id}
                href={`/admin/rooms/${room.id}/tasks/${task.id}`}
                className="fg-card fg-card-hover block p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-base"
                      style={{
                        fontFamily: 'var(--font-serif)',
                        color: 'var(--color-ink)',
                      }}
                    >
                      {task.name}
                    </div>
                    {task.notes && (
                      <div
                        className="text-xs fg-mono mt-1 line-clamp-2"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        {task.notes}
                      </div>
                    )}
                  </div>
                  <span
                    className={`fg-pill ${
                      task.is_turnaround
                        ? 'fg-pill-gold'
                        : task.frequency_days != null && task.frequency_days <= 2
                        ? 'fg-pill-red'
                        : task.frequency_days != null && task.frequency_days <= 7
                        ? 'fg-pill-amber'
                        : task.frequency_days != null && task.frequency_days <= 30
                        ? 'fg-pill-blue'
                        : 'fg-pill-muted'
                    } shrink-0 self-start`}
                  >
                    {formatFrequency(task.frequency_days, task.is_turnaround)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

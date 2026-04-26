import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { updateTaskTemplate, deleteTaskTemplate } from './actions'

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

/**
 * Given frequency_days, work out what amount + unit to pre-fill the form with.
 * Picks the largest unit that gives a clean whole number.
 *   1   -> { amount: 1, unit: 'days' }
 *   7   -> { amount: 1, unit: 'weeks' }
 *   14  -> { amount: 2, unit: 'weeks' }
 *   30  -> { amount: 1, unit: 'months' }
 *   21  -> { amount: 21, unit: 'days' }   (3 weeks but stays in days for clarity)
 */
function freqDaysToFormFields(days: number | null): {
  amount: number
  unit: 'days' | 'weeks' | 'months'
} {
  if (days == null || days < 1) return { amount: 7, unit: 'days' }
  if (days % 30 === 0) return { amount: days / 30, unit: 'months' }
  if (days === 7 || days === 14) return { amount: days / 7, unit: 'weeks' }
  return { amount: days, unit: 'days' }
}

export default async function AdminTaskEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; taskId: string }>
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  await requireAdmin()
  const { id: roomId, taskId } = await params
  const { saved, error } = await searchParams
  const supabase = await createClient()

  const { data: task } = await supabase
    .from('task_templates')
    .select('id, name, frequency_days, notes, is_turnaround, room_id')
    .eq('id', taskId)
    .single()

  if (!task) {
    return (
      <div className="fg-card p-8 text-center">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Task not found.{' '}
          <Link
            href={`/admin/rooms/${roomId}`}
            className="underline"
            style={{ color: 'var(--color-slate)' }}
          >
            Back to room
          </Link>
        </p>
      </div>
    )
  }

  // Fetch all rooms so the user can move the task to a different room.
  const { data: allRooms } = await supabase
    .from('rooms')
    .select('id, name, floor, room_type')
    .order('floor', { ascending: false })
    .order('name')

  const currentRoom = (allRooms ?? []).find((r) => r.id === task.room_id)
  const typeMeta = currentRoom
    ? TYPE_META[currentRoom.room_type] ?? TYPE_META.common
    : TYPE_META.common

  const { amount, unit } = freqDaysToFormFields(task.frequency_days)

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link
          href={`/admin/rooms/${roomId}`}
          className="text-xs fg-mono inline-flex items-center gap-1 mb-3"
          style={{ color: 'var(--color-muted)' }}
        >
          ← {currentRoom?.name ?? 'Back to room'}
        </Link>
        <div className="flex items-baseline gap-3">
          <span style={{ fontSize: 22 }}>{typeMeta.icon}</span>
          <h1
            className="text-2xl"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            Edit task
          </h1>
        </div>
        <p
          className="text-sm fg-mono mt-1"
          style={{ color: 'var(--color-muted)' }}
        >
          You're editing the task{' '}
          <span style={{ color: 'var(--color-ink)' }}>{task.name}</span>.
        </p>
      </div>

      {saved && <div className="fg-msg-success mb-4">Saved.</div>}
      {error && <div className="fg-msg-error mb-4">{error}</div>}

      <form
        action={updateTaskTemplate}
        className="fg-card-elevated space-y-6"
      >
        <input type="hidden" name="task_id" value={task.id} />
        <input type="hidden" name="room_id_original" value={roomId} />

        {/* Name */}
        <div>
          <label className="fg-label" htmlFor="edit-name">
            Name
          </label>
          <input
            id="edit-name"
            name="name"
            type="text"
            required
            defaultValue={task.name}
            className="fg-input"
          />
        </div>

        {/* Room */}
        <div>
          <label className="fg-label" htmlFor="edit-room">
            Room
          </label>
          <select
            id="edit-room"
            name="room_id"
            defaultValue={task.room_id}
            className="fg-input"
          >
            {(allRooms ?? []).map((r) => {
              const meta = TYPE_META[r.room_type] ?? TYPE_META.common
              return (
                <option key={r.id} value={r.id}>
                  {meta.icon} {r.name}
                </option>
              )
            })}
          </select>
          <p className="fg-helptext">
            Change this if you want to move the task to a different room.
          </p>
        </div>

        {/* Schedule type */}
        <div>
          <label className="fg-label">Schedule type</label>
          <div className="grid grid-cols-2 gap-2">
            <label
              className="fg-card flex items-start gap-3 p-3 cursor-pointer"
              style={{
                borderColor: !task.is_turnaround
                  ? 'var(--color-slate)'
                  : 'var(--color-warm)',
              }}
            >
              <input
                type="radio"
                name="schedule_type"
                value="regular"
                defaultChecked={!task.is_turnaround}
                className="mt-1"
              />
              <div>
                <div
                  className="text-sm"
                  style={{
                    fontFamily: 'var(--font-serif)',
                    color: 'var(--color-ink)',
                  }}
                >
                  Regular schedule
                </div>
                <div
                  className="text-xs fg-mono mt-0.5"
                  style={{ color: 'var(--color-muted)' }}
                >
                  Repeats every N days/weeks/months
                </div>
              </div>
            </label>
            <label
              className="fg-card flex items-start gap-3 p-3 cursor-pointer"
              style={{
                borderColor: task.is_turnaround
                  ? 'var(--color-slate)'
                  : 'var(--color-warm)',
              }}
            >
              <input
                type="radio"
                name="schedule_type"
                value="turnaround"
                defaultChecked={task.is_turnaround}
                className="mt-1"
              />
              <div>
                <div
                  className="text-sm"
                  style={{
                    fontFamily: 'var(--font-serif)',
                    color: 'var(--color-ink)',
                  }}
                >
                  On turnaround
                </div>
                <div
                  className="text-xs fg-mono mt-0.5"
                  style={{ color: 'var(--color-muted)' }}
                >
                  Triggered by guest changeover
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Frequency */}
        <div>
          <label className="fg-label">Frequency</label>
          <div className="flex items-center gap-2">
            <span
              className="text-sm shrink-0"
              style={{ color: 'var(--color-muted)' }}
            >
              Every
            </span>
            <input
              name="freq_amount"
              type="number"
              min="1"
              defaultValue={amount}
              className="fg-input"
              style={{ maxWidth: 100, textAlign: 'center' }}
            />
            <select
              name="freq_unit"
              defaultValue={unit}
              className="fg-input"
              style={{ maxWidth: 140 }}
            >
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
            </select>
          </div>
          <p className="fg-helptext">
            Stored as days (e.g. "every 1 week" → 7 days). Ignored if the task
            is set to turnaround.
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="fg-label" htmlFor="edit-notes">
            Note
          </label>
          <textarea
            id="edit-notes"
            name="notes"
            rows={3}
            defaultValue={task.notes ?? ''}
            placeholder="Special instructions, e.g. ⚠️ IMPORTANT: Use microfibre cloth only"
            className="fg-input"
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Link
            href={`/admin/rooms/${roomId}`}
            className="fg-btn-ghost text-sm"
          >
            Cancel
          </Link>
          <button type="submit" className="fg-btn-primary" style={{ width: 'auto' }}>
            Save changes
          </button>
        </div>
      </form>

      {/* Delete (separate form to avoid nested forms) */}
      <form
        action={deleteTaskTemplate}
        className="mt-6 flex justify-end"
      >
        <input type="hidden" name="task_id" value={task.id} />
        <input type="hidden" name="room_id" value={roomId} />
        <button
          type="submit"
          className="fg-btn-ghost text-xs"
          style={{
            color: 'var(--color-red)',
            borderColor: 'rgba(204, 51, 51, 0.3)',
          }}
        >
          Delete this task
        </button>
      </form>
    </div>
  )
}

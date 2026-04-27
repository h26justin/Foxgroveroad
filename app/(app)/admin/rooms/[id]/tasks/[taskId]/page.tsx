import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { updateTaskTemplate, deleteTaskTemplate } from './actions'

const TYPE_META: Record<string, { label: string; icon: string }> = {
  bedroom: { label: 'Bedroom', icon: '🛏' },
  bathroom: { label: 'Bathroom', icon: '🛁' },
  kitchen: { label: 'Kitchen', icon: '🍳' },
  dining: { label: 'Dining', icon: '🍽' },
  living: { label: 'Living', icon: '🛋' },
  utility: { label: 'Utility', icon: '🧺' },
  common: { label: 'Common', icon: '↗' },
  global: { label: 'Global', icon: '🏠' },
}

/**
 * The full set of schedule options in one dropdown.
 * Stored as `frequency_days` (or null + is_turnaround=true).
 *
 * `value` is what the form posts. Special value 'turnaround' for non-numeric.
 */
const SCHEDULE_OPTIONS: { value: string; label: string }[] = [
  { value: '1',           label: 'Every day' },
  { value: '2',           label: 'Every 2 days' },
  { value: '3',           label: 'Every 3 days' },
  { value: '5',           label: 'Every 5 days' },
  { value: '7',           label: 'Every week' },
  { value: '14',          label: 'Every 2 weeks' },
  { value: '21',          label: 'Every 3 weeks' },
  { value: '30',          label: 'Every month' },
  { value: '60',          label: 'Every 2 months' },
  { value: '90',          label: 'Every 3 months' },
  { value: '120',         label: 'Every 4 months' },
  { value: '150',         label: 'Every 5 months' },
  { value: '180',         label: 'Every 6 months' },
  { value: '365',         label: 'Every year' },
  { value: 'turnaround',  label: 'On turnaround (between guests)' },
]

/**
 * Pick the best dropdown option for a stored frequency_days value.
 * Falls back to "every 7 days" if no exact match. Returns the option's
 * `value` string.
 */
function pickScheduleValue(days: number | null, isTurnaround: boolean): string {
  if (isTurnaround) return 'turnaround'
  if (days == null) return '7'
  // Try exact match first
  const exact = SCHEDULE_OPTIONS.find((o) => o.value === String(days))
  if (exact) return exact.value
  // Otherwise we'll show a custom option and select it
  return String(days)
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

  const { data: allRooms } = await supabase
    .from('rooms')
    .select('id, name, floor, room_type')
    .order('floor', { ascending: false })
    .order('name')

  const currentRoom = (allRooms ?? []).find((r) => r.id === task.room_id)
  const typeMeta = currentRoom
    ? TYPE_META[currentRoom.room_type] ?? TYPE_META.common
    : TYPE_META.common

  const currentScheduleValue = pickScheduleValue(
    task.frequency_days,
    task.is_turnaround
  )
  const isCustomFrequency =
    !task.is_turnaround &&
    task.frequency_days != null &&
    !SCHEDULE_OPTIONS.some((o) => o.value === String(task.frequency_days))

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb / back */}
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
          {task.name}
        </p>
      </div>

      {saved && <div className="fg-msg-success mb-4">Saved.</div>}
      {error && <div className="fg-msg-error mb-4">{error}</div>}

      <form
        action={updateTaskTemplate}
        className="fg-card p-5 md:p-7 space-y-5"
      >
        <input type="hidden" name="task_id" value={task.id} />
        <input type="hidden" name="room_id_original" value={roomId} />

        {/* Name */}
        <div>
          <label className="fg-label" htmlFor="edit-name">Name</label>
          <input
            id="edit-name"
            name="name"
            type="text"
            required
            defaultValue={task.name}
            className="fg-input"
          />
        </div>

        {/* Schedule — combined dropdown */}
        <div>
          <label className="fg-label" htmlFor="edit-schedule">
            How often
          </label>
          <select
            id="edit-schedule"
            name="schedule"
            defaultValue={currentScheduleValue}
            className="fg-input"
          >
            {isCustomFrequency && (
              <option value={String(task.frequency_days)}>
                Every {task.frequency_days} days (custom)
              </option>
            )}
            {SCHEDULE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="fg-helptext">
            "On turnaround" means the task fires when a guest checks out and a
            new one is due — sheets, towels, etc. Everything else repeats on
            its day count.
          </p>
        </div>

        {/* Room */}
        <div>
          <label className="fg-label" htmlFor="edit-room">Room</label>
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
        </div>

        {/* Notes */}
        <div>
          <label className="fg-label" htmlFor="edit-notes">Note</label>
          <textarea
            id="edit-notes"
            name="notes"
            rows={3}
            defaultValue={task.notes ?? ''}
            placeholder="Special instructions, e.g. ⚠️ Use microfibre cloth only"
            className="fg-input"
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-3 pt-2">
          <Link
            href={`/admin/rooms/${roomId}`}
            className="fg-btn-ghost text-sm text-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="fg-btn-primary"
            style={{ width: 'auto' }}
          >
            Save changes
          </button>
        </div>
      </form>

      {/* Delete (separate form to avoid nested forms) */}
      <form action={deleteTaskTemplate} className="mt-6 flex justify-end">
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

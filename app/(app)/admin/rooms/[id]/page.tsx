import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { floorLabel } from '@/lib/floors'
import {
  createTaskTemplate,
  toggleRoomCotCapacity,
  bulkUpdateTaskKinds,
  setLinkedBedroom,
} from './actions'

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
    .select('id, name, floor, room_type, is_owner_room, can_fit_cot, linked_bedroom_id')
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
    .select('id, name, frequency_days, notes, is_turnaround, task_kind')
    .eq('room_id', id)
    .order('is_turnaround', { ascending: true })
    .order('frequency_days', { ascending: true, nullsFirst: false })
    .order('name')

  // For bathrooms: list of all guest bedrooms to pick a "linked bedroom" from.
  // Skipped for non-bathrooms.
  let bedroomOptions: { id: string; name: string }[] = []
  if (room.room_type === 'bathroom') {
    const { data: bedrooms } = await supabase
      .from('rooms')
      .select('id, name')
      .eq('room_type', 'bedroom')
      .eq('is_owner_room', false)
      .order('name')
    bedroomOptions = (bedrooms as any[]) ?? []
  }

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
            className="text-2xl md:text-3xl"
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
          {floorLabel(room.floor)} ·{' '}
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

      {/* Cot capacity toggle — only relevant for bedrooms */}
      {room.room_type === 'bedroom' && (
        <section className="mb-8">
          <h2 className="fg-section-label mb-3">Room facts</h2>
          <div className="fg-card p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div
                className="text-sm"
                style={{
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--color-ink)',
                }}
              >
                Can fit a travel cot?
              </div>
              <div
                className="text-xs fg-mono mt-1"
                style={{ color: 'var(--color-muted)' }}
              >
                Used to warn admins when a guest needs a cot but the room
                they're assigned to is too small for one.
              </div>
            </div>
            <form action={toggleRoomCotCapacity} className="flex gap-2">
              <input type="hidden" name="room_id" value={room.id} />
              <input
                type="hidden"
                name="can_fit_cot"
                value={room.can_fit_cot === false ? '1' : '0'}
              />
              <button
                type="submit"
                className={
                  room.can_fit_cot === false
                    ? 'fg-btn-ghost text-xs'
                    : 'fg-btn-gold text-xs'
                }
                style={{ width: 'auto', padding: '8px 14px' }}
              >
                {room.can_fit_cot === false
                  ? 'No → Yes'
                  : 'Yes → No'}
              </button>
              <span
                className="fg-pill text-xs"
                style={{
                  background:
                    room.can_fit_cot === false
                      ? 'rgba(204, 51, 51, 0.13)'
                      : 'rgba(26, 158, 101, 0.13)',
                  color:
                    room.can_fit_cot === false
                      ? 'var(--color-red)'
                      : 'var(--color-green)',
                }}
              >
                {room.can_fit_cot === false ? 'Too small' : 'Cot OK'}
              </span>
            </form>
          </div>
        </section>
      )}

      {/* Bathroom: link to a bedroom so the bathroom inherits its
          occupancy state (turnover tasks fire when guests leave). */}
      {room.room_type === 'bathroom' && (
        <section className="mb-8">
          <h2 className="fg-section-label mb-3">Linked bedroom</h2>
          <div className="fg-card p-4">
            <div className="text-xs fg-mono mb-3" style={{ color: 'var(--color-muted)' }}>
              Pick the guest bedroom this bathroom belongs to. When guests
              leave that bedroom, this bathroom&apos;s turnover tasks
              (e.g. &quot;Replace towels&quot;) will appear in the cleaning
              list. Leave blank if this bathroom is shared by multiple
              bedrooms — its tasks will run on their normal schedule.
            </div>
            <form action={setLinkedBedroom} className="flex items-center gap-2 flex-wrap">
              <input type="hidden" name="room_id" value={room.id} />
              <select
                name="linked_bedroom_id"
                defaultValue={room.linked_bedroom_id ?? ''}
                className="fg-input"
                style={{ flex: '1 1 200px' }}
              >
                <option value="">(not linked — shared bathroom)</option>
                {bedroomOptions.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button type="submit" className="fg-btn-gold text-xs"
                style={{ width: 'auto', padding: '8px 14px' }}>
                Save link
              </button>
            </form>
          </div>
        </section>
      )}

      {/* Add new task form — simplified */}
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

          <div>
            <label className="fg-label" htmlFor="new-schedule">How often</label>
            <select
              id="new-schedule"
              name="schedule"
              defaultValue="7"
              className="fg-input"
            >
              {SCHEDULE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="fg-label" htmlFor="new-notes">
              Note (optional)
            </label>
            <textarea
              id="new-notes"
              name="notes"
              rows={2}
              placeholder="Special instructions, e.g. ⚠️ Use microfibre cloth only"
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
          <form action={bulkUpdateTaskKinds}>
            <input type="hidden" name="room_id" value={room.id} />

            <p
              className="text-xs fg-mono mb-3"
              style={{ color: 'var(--color-muted)' }}
            >
              <strong>Turnover</strong> = appears when guests leave (make
              bed, water bottle). <strong>Recurring</strong> = on its own
              schedule regardless. <strong>Occupied-only</strong> = only
              while guests are in the room (empty bin).
            </p>

            <div className="space-y-2 mb-4">
              {taskList.map((task) => (
                <div key={task.id} className="fg-card p-4">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="min-w-0 flex-1" style={{ minWidth: 200 }}>
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
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
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
                          } text-xs`}
                        >
                          {formatFrequency(task.frequency_days, task.is_turnaround)}
                        </span>
                        <Link
                          href={`/admin/rooms/${room.id}/tasks/${task.id}`}
                          className="text-xs fg-mono underline-offset-4 hover:underline"
                          style={{ color: 'var(--color-blue)' }}
                        >
                          Edit
                        </Link>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <label
                        className="text-[10px] fg-mono block mb-1"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        KIND
                      </label>
                      <select
                        name={`kind_${task.id}`}
                        defaultValue={task.task_kind ?? 'recurring'}
                        className="fg-input"
                        style={{ minWidth: 160 }}
                      >
                        <option value="turnover">Turnover</option>
                        <option value="recurring">Recurring</option>
                        <option value="occupied_only">Occupied-only</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="sticky bottom-2 fg-card p-3 flex items-center justify-between gap-3 flex-wrap"
              style={{ background: 'var(--color-cream)' }}>
              <span className="text-xs fg-mono" style={{ color: 'var(--color-muted)' }}>
                Change task kinds above, then save once for the whole room.
              </span>
              <button type="submit" className="fg-btn-gold"
                style={{ width: 'auto', padding: '8px 18px' }}>
                Save kinds
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}

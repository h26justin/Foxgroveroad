'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

function parseSchedule(raw: string): {
  isTurnaround: boolean
  frequencyDays: number | null
  taskKind: 'turnover' | 'recurring' | 'occupied_only'
  error?: string
} {
  if (raw === 'turnaround') {
    return { isTurnaround: true, frequencyDays: null, taskKind: 'turnover' }
  }
  const days = parseInt(raw, 10)
  if (!Number.isFinite(days) || days < 1) {
    return {
      isTurnaround: false,
      frequencyDays: null,
      taskKind: 'recurring',
      error: 'Pick a schedule for the task',
    }
  }
  return { isTurnaround: false, frequencyDays: days, taskKind: 'recurring' }
}

export async function createTaskTemplate(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const roomId = String(formData.get('room_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const scheduleRaw = String(formData.get('schedule') ?? '')
  const notesRaw = String(formData.get('notes') ?? '').trim()

  const back = `/admin/rooms/${roomId}`

  if (!roomId) {
    redirect(`/admin/rooms?error=${encodeURIComponent('Missing room id')}`)
  }
  if (!name) {
    redirect(`${back}?error=${encodeURIComponent('Task name is required')}`)
  }

  const sched = parseSchedule(scheduleRaw)
  if (sched.error) {
    redirect(`${back}?error=${encodeURIComponent(sched.error)}`)
  }

  const { error } = await supabase.from('task_templates').insert({
    room_id: roomId,
    name,
    frequency_days: sched.frequencyDays,
    is_turnaround: sched.isTurnaround,
    task_kind: sched.taskKind,
    notes: notesRaw || null,
  })

  if (error) {
    redirect(`${back}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/rooms/${roomId}`)
  revalidatePath('/admin/rooms')
  redirect(`${back}?saved=1`)
}

export async function toggleRoomCotCapacity(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const roomId = String(formData.get('room_id') ?? '')
  const canFitCot = String(formData.get('can_fit_cot') ?? '0') === '1'

  if (!roomId) {
    redirect(`/admin/rooms?error=${encodeURIComponent('Missing room id')}`)
  }

  const { error } = await supabase
    .from('rooms')
    .update({ can_fit_cot: canFitCot })
    .eq('id', roomId)

  if (error) {
    redirect(`/admin/rooms/${roomId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/rooms/${roomId}`)
  revalidatePath('/admin/rooms')
  revalidatePath('/bedrooms')
  redirect(`/admin/rooms/${roomId}?saved=1`)
}

/**
 * Bulk-update the task_kind for all tasks in a room.
 * Form posts: room_id, plus kind_<task_id>=<turnover|recurring|occupied_only>
 * for each task being changed. Tasks not present in the form are untouched.
 */
export async function bulkUpdateTaskKinds(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const roomId = String(formData.get('room_id') ?? '')
  if (!roomId) {
    redirect(`/admin/rooms?error=${encodeURIComponent('Missing room id')}`)
  }

  const validKinds = new Set(['turnover', 'recurring', 'occupied_only'])
  const updates: { id: string; kind: string }[] = []
  for (const [key, val] of formData.entries()) {
    if (!key.startsWith('kind_')) continue
    const taskId = key.slice('kind_'.length)
    const kind = String(val)
    if (!validKinds.has(kind)) continue
    updates.push({ id: taskId, kind })
  }

  // Update one-by-one. We can't bulk-update different values cleanly, but
  // the per-room task counts are small (≤ ~30) so this is fine.
  for (const u of updates) {
    const { error } = await supabase
      .from('task_templates')
      .update({ task_kind: u.kind })
      .eq('id', u.id)
      .eq('room_id', roomId) // belt-and-braces — don't allow cross-room updates
    if (error) {
      redirect(
        `/admin/rooms/${roomId}?error=${encodeURIComponent(
          'Failed to update some tasks: ' + error.message
        )}`
      )
    }
  }

  revalidatePath(`/admin/rooms/${roomId}`)
  revalidatePath('/admin/rooms')
  revalidatePath('/housekeeping')
  redirect(`/admin/rooms/${roomId}?saved=1`)
}

/**
 * Set or clear the linked_bedroom for a bathroom.
 * Form posts: room_id, linked_bedroom_id (empty string = clear).
 */
export async function setLinkedBedroom(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const roomId = String(formData.get('room_id') ?? '')
  const linkedRaw = String(formData.get('linked_bedroom_id') ?? '').trim()
  const linkedId = linkedRaw === '' ? null : linkedRaw

  if (!roomId) {
    redirect(`/admin/rooms?error=${encodeURIComponent('Missing room id')}`)
  }

  const { error } = await supabase
    .from('rooms')
    .update({ linked_bedroom_id: linkedId })
    .eq('id', roomId)

  if (error) {
    redirect(
      `/admin/rooms/${roomId}?error=${encodeURIComponent(error.message)}`
    )
  }

  revalidatePath(`/admin/rooms/${roomId}`)
  revalidatePath('/admin/rooms')
  revalidatePath('/housekeeping')
  redirect(`/admin/rooms/${roomId}?saved=1`)
}

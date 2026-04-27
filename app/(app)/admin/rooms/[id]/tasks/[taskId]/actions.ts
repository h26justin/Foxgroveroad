'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

/**
 * Parse the simplified `schedule` form field. It's either:
 *   - 'turnaround' (special)
 *   - a positive integer string (number of days)
 */
function parseSchedule(raw: string): {
  isTurnaround: boolean
  frequencyDays: number | null
  error?: string
} {
  if (raw === 'turnaround') {
    return { isTurnaround: true, frequencyDays: null }
  }
  const days = parseInt(raw, 10)
  if (!Number.isFinite(days) || days < 1) {
    return {
      isTurnaround: false,
      frequencyDays: null,
      error: 'Pick a schedule for the task',
    }
  }
  return { isTurnaround: false, frequencyDays: days }
}

export async function updateTaskTemplate(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const taskId = String(formData.get('task_id') ?? '')
  const originalRoomId = String(formData.get('room_id_original') ?? '')
  const newRoomId = String(formData.get('room_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const scheduleRaw = String(formData.get('schedule') ?? '')
  const notesRaw = String(formData.get('notes') ?? '').trim()

  const back = `/admin/rooms/${originalRoomId}/tasks/${taskId}`

  if (!taskId) {
    redirect(`/admin/rooms?error=${encodeURIComponent('Missing task id')}`)
  }
  if (!name) {
    redirect(`${back}?error=${encodeURIComponent('Task name is required')}`)
  }
  if (!newRoomId) {
    redirect(`${back}?error=${encodeURIComponent('Room is required')}`)
  }

  const sched = parseSchedule(scheduleRaw)
  if (sched.error) {
    redirect(`${back}?error=${encodeURIComponent(sched.error)}`)
  }

  const { error } = await supabase
    .from('task_templates')
    .update({
      room_id: newRoomId,
      name,
      frequency_days: sched.frequencyDays,
      is_turnaround: sched.isTurnaround,
      notes: notesRaw || null,
    })
    .eq('id', taskId)

  if (error) {
    redirect(`${back}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/rooms/${originalRoomId}`)
  revalidatePath('/admin/rooms')
  if (newRoomId !== originalRoomId) {
    revalidatePath(`/admin/rooms/${newRoomId}`)
    redirect(`/admin/rooms/${newRoomId}/tasks/${taskId}?saved=1`)
  }
  redirect(`${back}?saved=1`)
}

export async function deleteTaskTemplate(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const taskId = String(formData.get('task_id') ?? '')
  const roomId = String(formData.get('room_id') ?? '')

  if (!taskId || !roomId) {
    redirect(
      `/admin/rooms?error=${encodeURIComponent('Missing task or room id')}`
    )
  }

  const { error } = await supabase
    .from('task_templates')
    .delete()
    .eq('id', taskId)

  if (error) {
    redirect(
      `/admin/rooms/${roomId}/tasks/${taskId}?error=${encodeURIComponent(
        error.message
      )}`
    )
  }

  revalidatePath(`/admin/rooms/${roomId}`)
  revalidatePath('/admin/rooms')
  redirect(`/admin/rooms/${roomId}?deleted=1`)
}

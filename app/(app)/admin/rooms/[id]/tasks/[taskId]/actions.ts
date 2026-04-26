'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

const UNIT_TO_DAYS: Record<string, number> = {
  days: 1,
  weeks: 7,
  months: 30,
}

export async function updateTaskTemplate(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const taskId = String(formData.get('task_id') ?? '')
  const originalRoomId = String(formData.get('room_id_original') ?? '')
  const newRoomId = String(formData.get('room_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const scheduleType = String(formData.get('schedule_type') ?? 'regular')
  const freqAmountRaw = String(formData.get('freq_amount') ?? '')
  const freqUnit = String(formData.get('freq_unit') ?? 'days')
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

  let frequencyDays: number | null = null
  let isTurnaround = false

  if (scheduleType === 'turnaround') {
    isTurnaround = true
    frequencyDays = null
  } else {
    const amount = parseInt(freqAmountRaw, 10)
    const perUnit = UNIT_TO_DAYS[freqUnit]
    if (!Number.isFinite(amount) || amount < 1 || !perUnit) {
      redirect(
        `${back}?error=${encodeURIComponent(
          'Frequency must be a positive number with a valid unit'
        )}`
      )
    }
    frequencyDays = amount * perUnit
  }

  const { error } = await supabase
    .from('task_templates')
    .update({
      room_id: newRoomId,
      name,
      frequency_days: frequencyDays,
      is_turnaround: isTurnaround,
      notes: notesRaw || null,
    })
    .eq('id', taskId)

  if (error) {
    redirect(`${back}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/rooms/${originalRoomId}`)
  revalidatePath('/admin/rooms')
  // If the room was changed, revalidate the new room's page too
  if (newRoomId !== originalRoomId) {
    revalidatePath(`/admin/rooms/${newRoomId}`)
    // And bounce the user to the new room's edit page
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

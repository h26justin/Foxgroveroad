'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

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
    notes: notesRaw || null,
  })

  if (error) {
    redirect(`${back}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/rooms/${roomId}`)
  revalidatePath('/admin/rooms')
  redirect(`${back}?saved=1`)
}

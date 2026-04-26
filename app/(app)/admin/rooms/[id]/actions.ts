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

export async function createTaskTemplate(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const roomId = String(formData.get('room_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const scheduleType = String(formData.get('schedule_type') ?? 'regular')
  const freqAmountRaw = String(formData.get('freq_amount') ?? '')
  const freqUnit = String(formData.get('freq_unit') ?? 'days')
  const notesRaw = String(formData.get('notes') ?? '').trim()

  const back = `/admin/rooms/${roomId}`

  if (!roomId) {
    redirect(`/admin/rooms?error=${encodeURIComponent('Missing room id')}`)
  }
  if (!name) {
    redirect(`${back}?error=${encodeURIComponent('Task name is required')}`)
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

  const { error } = await supabase.from('task_templates').insert({
    room_id: roomId,
    name,
    frequency_days: frequencyDays,
    is_turnaround: isTurnaround,
    notes: notesRaw || null,
  })

  if (error) {
    redirect(`${back}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/rooms/${roomId}`)
  revalidatePath('/admin/rooms')
  redirect(`${back}?saved=1`)
}

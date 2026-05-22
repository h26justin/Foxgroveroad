'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { getCleanerForProfile } from '@/lib/cleaner-self-log'

export async function logMyHours(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireProfile()
  if (profile.role !== 'cleaner' && profile.role !== 'admin') {
    return { error: 'Only cleaners and admins can log hours.' }
  }

  // Find the cleaner record linked to this profile.
  const cleaner = await getCleanerForProfile(profile.id)
  if (!cleaner) {
    return {
      error:
        "Your profile isn't linked to a cleaner record yet — ask an admin to link you on the Team page.",
    }
  }

  const date = String(formData.get('date') ?? '').trim()
  const hoursRaw = String(formData.get('hours') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: 'Invalid date' }
  }
  const hours = Number(hoursRaw)
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return { error: 'Hours must be between 0 and 24' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('cleaner_hour_logs').insert({
    cleaner_id: cleaner.id,
    date,
    hours,
    notes,
    logged_by: profile.id,
  } as any)

  if (error) return { error: error.message }

  revalidatePath('/housekeeping')
  revalidatePath('/pay')
  return { ok: true }
}

export async function deleteMyHourLog(
  logId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireProfile()
  if (!logId) return { error: 'Missing log id' }

  const supabase = await createClient()
  // RLS only allows deleting your own logs (or admin), so we trust the
  // policy to gate this.
  const { error } = await supabase
    .from('cleaner_hour_logs')
    .delete()
    .eq('id', logId)

  if (error) return { error: error.message }

  revalidatePath('/housekeeping')
  revalidatePath('/pay')
  return { ok: true }
}

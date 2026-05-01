'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

/**
 * Submit (or overwrite) hours for a given week.
 *
 * Form fields:
 *   week_start_date  — YYYY-MM-DD (must be a Monday)
 *   linda_hours      — number, 0..168
 *   sam_hours        — number, 0..168
 *   notes            — optional, max 1000 chars
 *
 * Rates are read at submit time and stored on the row, so historical
 * pay survives rate changes.
 */
export async function submitWeekHours(
  formData: FormData
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireAdmin()
  const supabase = await createClient()

  const weekStartDate = String(formData.get('week_start_date') ?? '').trim()
  const lindaHoursRaw = String(formData.get('linda_hours') ?? '0').trim()
  const samHoursRaw = String(formData.get('sam_hours') ?? '0').trim()
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!weekStartDate) return { error: 'Missing week start date' }
  // Sanity: must be a Monday
  const d = new Date(weekStartDate + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return { error: 'Invalid date' }
  // JS getDay: 0=Sun, 1=Mon … 6=Sat
  if (d.getDay() !== 1) return { error: 'Week must start on a Monday' }

  const lindaHours = Number(lindaHoursRaw)
  const samHours = Number(samHoursRaw)
  if (!Number.isFinite(lindaHours) || lindaHours < 0 || lindaHours > 168) {
    return { error: "Linda's hours must be between 0 and 168" }
  }
  if (!Number.isFinite(samHours) || samHours < 0 || samHours > 168) {
    return { error: "Sam's hours must be between 0 and 168" }
  }

  // Read current rates
  const { data: rates, error: ratesErr } = await supabase
    .from('cleaner_pay_rates')
    .select('linda_hourly, sam_hourly, linda_bonus_per_sam_hour')
    .eq('id', 'singleton')
    .single()

  if (ratesErr || !rates) {
    return { error: 'Could not read pay rates. Run v14 SQL first.' }
  }

  // Upsert (one row per week)
  const payload = {
    week_start_date: weekStartDate,
    linda_hours: lindaHours,
    sam_hours: samHours,
    linda_hourly_at_submit: rates.linda_hourly,
    sam_hourly_at_submit: rates.sam_hourly,
    linda_bonus_per_sam_hour_at_submit: rates.linda_bonus_per_sam_hour,
    notes,
    submitted_by: profile.id,
  }

  const { error } = await supabase
    .from('cleaner_hours')
    .upsert(payload, { onConflict: 'week_start_date' })

  if (error) return { error: error.message }

  revalidatePath('/pay')
  return { ok: true }
}

/**
 * Update the pay rates. Affects future submissions only — past rows
 * keep their snapshotted rates.
 */
export async function updatePayRates(
  formData: FormData
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireAdmin()
  const supabase = await createClient()

  const lindaHourly = Number(String(formData.get('linda_hourly') ?? ''))
  const samHourly = Number(String(formData.get('sam_hourly') ?? ''))
  const bonus = Number(String(formData.get('linda_bonus_per_sam_hour') ?? ''))

  if (!Number.isFinite(lindaHourly) || lindaHourly < 0 || lindaHourly > 1000)
    return { error: "Linda's hourly rate must be between 0 and 1000" }
  if (!Number.isFinite(samHourly) || samHourly < 0 || samHourly > 1000)
    return { error: "Sam's hourly rate must be between 0 and 1000" }
  if (!Number.isFinite(bonus) || bonus < 0 || bonus > 1000)
    return { error: 'Bonus rate must be between 0 and 1000' }

  const { error } = await supabase
    .from('cleaner_pay_rates')
    .update({
      linda_hourly: lindaHourly,
      sam_hourly: samHourly,
      linda_bonus_per_sam_hour: bonus,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq('id', 'singleton')

  if (error) return { error: error.message }

  revalidatePath('/pay')
  return { ok: true }
}

/**
 * Delete a logged week. Use sparingly — for fixing accidental
 * submissions. The history is otherwise meant to be append/overwrite.
 */
export async function deleteWeekHours(
  weekStartDate: string
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  if (!weekStartDate) return { error: 'Missing week start date' }

  const { error } = await supabase
    .from('cleaner_hours')
    .delete()
    .eq('week_start_date', weekStartDate)

  if (error) return { error: error.message }

  revalidatePath('/pay')
  return { ok: true }
}

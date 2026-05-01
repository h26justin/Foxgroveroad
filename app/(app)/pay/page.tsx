import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import PayClient from './PayClient'

export const revalidate = 30

/**
 * Admin-only — the pay calculator for the cleaning team.
 *
 * Cleaners and family users hitting this page are bounced to /house;
 * pay is genuinely none of their business.
 */
export default async function PayPage() {
  const [profile, supabase] = await Promise.all([
    requireProfile(),
    createClient(),
  ])
  if (profile.role !== 'admin') redirect('/house')

  // Fire all three queries in parallel
  const [ratesRes, weeksRes] = await Promise.all([
    supabase
      .from('cleaner_pay_rates')
      .select('linda_hourly, sam_hourly, linda_bonus_per_sam_hour, updated_at')
      .eq('id', 'singleton')
      .single(),
    supabase
      .from('cleaner_hours')
      .select(
        'id, week_start_date, linda_hours, sam_hours, linda_hourly_at_submit, sam_hourly_at_submit, linda_bonus_per_sam_hour_at_submit, notes, submitted_at, submitted_by, profiles:profiles!cleaner_hours_submitted_by_fkey(full_name)'
      )
      .order('week_start_date', { ascending: false })
      .limit(52), // last year
  ])

  const rates = ratesRes.data ?? null
  const weeks = (weeksRes.data as any[]) ?? []

  return (
    <PayClient
      currentRates={
        rates ?? {
          linda_hourly: 15,
          sam_hourly: 15,
          linda_bonus_per_sam_hour: 2,
          updated_at: null,
        }
      }
      weeks={weeks.map((w) => ({
        id: w.id,
        week_start_date: w.week_start_date,
        linda_hours: Number(w.linda_hours),
        sam_hours: Number(w.sam_hours),
        linda_hourly_at_submit: Number(w.linda_hourly_at_submit),
        sam_hourly_at_submit: Number(w.sam_hourly_at_submit),
        linda_bonus_per_sam_hour_at_submit: Number(
          w.linda_bonus_per_sam_hour_at_submit
        ),
        notes: w.notes,
        submitted_at: w.submitted_at,
        submitter_name: w.profiles?.full_name ?? 'Unknown',
      }))}
    />
  )
}

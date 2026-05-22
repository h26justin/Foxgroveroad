import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isFeatureEnabled } from '@/lib/feature-flags'
import {
  selfLoggedHoursForWeek,
  mondayOfWeek,
} from '@/lib/cleaner-self-log'
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
  if (!(await isFeatureEnabled('pay'))) redirect('/housekeeping')

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

  // v41: pull this week's self-logged hours so admin can see what
  // cleaners reported before typing the weekly totals.
  const today = new Date().toISOString().slice(0, 10)
  const currentWeekMonday = mondayOfWeek(today)
  const selfLogged = await selfLoggedHoursForWeek(currentWeekMonday)

  return (
    <>
      {(selfLogged.linda > 0 || selfLogged.sam > 0) && (
        <div
          className="fg-card p-3 mb-4 text-sm"
          style={{
            borderLeft: '4px solid var(--color-blue, #3b82f6)',
            background: 'rgba(59,130,246,0.04)',
          }}
        >
          <strong>Self-logged this week:</strong>{' '}
          Linda {(selfLogged.linda ?? 0).toFixed(2)}h · Sam{' '}
          {(selfLogged.sam ?? 0).toFixed(2)}h{' '}
          <span
            className="fg-mono text-xs"
            style={{ color: 'var(--color-muted)' }}
          >
            — use as a starting point when filling in the weekly totals below.
          </span>
        </div>
      )}
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
    </>
  )
}

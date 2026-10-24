import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { addDaysISO } from '@/lib/dates'

export type CleanerForProfile = {
  id: string
  name: string
} | null

/**
 * Returns the cleaner record linked to the given profile, or null if
 * the profile isn't linked to one. Used to gate the self-log UI to
 * cleaners who actually have a cleaners row.
 */
export async function getCleanerForProfile(
  profileId: string,
): Promise<CleanerForProfile> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('cleaners')
    .select('id, name')
    .eq('profile_id', profileId)
    .eq('is_active', true)
    .maybeSingle()
  if (!data) return null
  return { id: data.id, name: data.name }
}

export type SelfLogRow = {
  id: string
  date: string
  hours: number
  notes: string | null
  logged_at: string
}

/**
 * Recent self-log entries for a cleaner — newest first.
 */
export async function recentSelfLogsForCleaner(
  cleanerId: string,
  limit = 14,
): Promise<SelfLogRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('cleaner_hour_logs')
    .select('id, date, hours, notes, logged_at')
    .eq('cleaner_id', cleanerId)
    .order('date', { ascending: false })
    .order('logged_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((r) => ({
    id: r.id,
    date: r.date,
    hours: Number(r.hours),
    notes: r.notes ?? null,
    logged_at: r.logged_at,
  }))
}

/**
 * Sum of self-logged hours for each cleaner during the given week
 * (week_start = Monday, inclusive). Returns a map keyed by lower-cased
 * cleaner name so /pay can use it directly (the legacy schema uses
 * 'linda' / 'sam' columns).
 */
export async function selfLoggedHoursForWeek(
  weekStartIso: string,
): Promise<Record<string, number>> {
  const supabase = await createClient()
  const start = weekStartIso
  const end = addDaysISO(start, 6)

  const { data } = await supabase
    .from('cleaner_hour_logs')
    .select(
      'hours, cleaners:cleaners!cleaner_hour_logs_cleaner_id_fkey(name)',
    )
    .gte('date', start)
    .lte('date', end)

  const totals: Record<string, number> = {}
  for (const r of data ?? []) {
    const name = (r.cleaners?.name ?? '').toString().toLowerCase()
    if (!name) continue
    totals[name] = (totals[name] ?? 0) + Number(r.hours)
  }
  return totals
}

/** Monday ISO date for the week containing the given ISO date.
 *  v45: UTC-only so the result doesn't shift by ±1 day in BST. */
export function mondayOfWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  const day = d.getUTCDay() // 0 = Sun, 1 = Mon, ...
  const daysSinceMon = day === 0 ? 6 : day - 1
  d.setUTCDate(d.getUTCDate() - daysSinceMon)
  return d.toISOString().slice(0, 10)
}

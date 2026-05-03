import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * The canonical list of togglable features. Adding a new entry here
 * surfaces a toggle on /admin/features automatically.
 *
 * Important conventions:
 *   - Default is ON. A missing row in `feature_flags` means enabled.
 *   - Disabling a feature hides its UI but preserves its data.
 *   - Core features (house, housekeeping, bookings, team, settings)
 *     are NOT in this list — turning them off would break the app.
 */
export const FEATURES = [
  {
    name: 'linen',
    label: 'Linen tracking',
    description:
      'The Linen tab. Tracks bedsheet sets per room and laundry status.',
  },
  {
    name: 'pay',
    label: 'Cleaner pay',
    description:
      'The Pay tab. Tracks weekly pay per cleaner. Admin-only.',
  },
  {
    name: 'issues',
    label: 'Issues / reporting',
    description:
      'The Issues tab plus the "Report issue" buttons throughout the app.',
  },
  {
    name: 'guests',
    label: 'Guest profiles',
    description:
      'The Guests admin tab. Stores notes about repeat visitors.',
  },
  {
    name: 'oneshot_tasks',
    label: 'One-off tasks',
    description:
      'Ad-hoc admin → cleaner tasks. Hides the "+ Post task" button and the One-off section on the housekeeping page.',
  },
] as const

export type FeatureName = (typeof FEATURES)[number]['name']

/**
 * Fetch the current state of all feature flags as a name → enabled
 * map. Cached per-request (React `cache`) so calling it from multiple
 * components in the same request hits the DB once.
 *
 * Missing rows are treated as ENABLED, matching the table's default.
 */
export const getFeatureFlags = cache(
  async (): Promise<Record<string, boolean>> => {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('feature_flags')
        .select('name, enabled')
      if (error) {
        console.error('[features] query failed:', error.message)
        return defaultFlagMap()
      }
      const map = defaultFlagMap()
      for (const row of (data as any[]) ?? []) {
        map[row.name] = !!row.enabled
      }
      return map
    } catch (err: any) {
      console.error('[features] threw:', err?.message ?? err)
      return defaultFlagMap()
    }
  },
)

/**
 * Convenience: is this single feature enabled?
 */
export async function isFeatureEnabled(name: FeatureName): Promise<boolean> {
  const flags = await getFeatureFlags()
  return flags[name] !== false
}

function defaultFlagMap(): Record<string, boolean> {
  const m: Record<string, boolean> = {}
  for (const f of FEATURES) m[f.name] = true
  return m
}

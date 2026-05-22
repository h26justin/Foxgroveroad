import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Returns the current Supabase auth user, or null if not signed in.
 * Use this in server components/actions to gate access.
 *
 * Wrapped in React's `cache()` so multiple calls within a single request
 * (e.g. layout + page) share one Supabase round-trip.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/**
 * Returns the current user's profile row (id, full_name, role, ...) or null.
 * Most pages should use this rather than getCurrentUser, since the role
 * lives on the profile, not on auth.users.
 *
 * Cached per-request so layout + page calls are deduped.
 */
export const getCurrentProfile = cache(async () => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Filter is_deleted=false so a soft-deleted user whose JWT hasn't
  // yet expired can't continue acting in the app. Without this, there's
  // a window (~JWT TTL) where a banned/anonymised user could still hit
  // pages until their session refreshes and gets rejected at auth.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, phone, accessibility_mode')
    .eq('id', user.id)
    .eq('is_deleted', false)
    .single()

  return profile
})

/**
 * Throws + redirects to /login if not signed in. Returns the profile.
 * Use as `const profile = await requireProfile()` at the top of any
 * authed page — handles auth checks in one line.
 */
export async function requireProfile() {
  const profile = await getCurrentProfile()
  if (!profile) {
    const { redirect } = await import('next/navigation')
    redirect('/login')
  }
  return profile!
}

/**
 * Convenience: throws + redirects if not an admin.
 */
export async function requireAdmin() {
  const profile = await requireProfile()
  if (profile.role !== 'admin') {
    const { redirect } = await import('next/navigation')
    redirect('/housekeeping')
  }
  return profile
}

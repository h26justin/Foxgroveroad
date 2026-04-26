import { createClient } from '@/lib/supabase/server'

/**
 * Returns the current Supabase auth user, or null if not signed in.
 * Use this in server components/actions to gate access.
 */
export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * Returns the current user's profile row (id, full_name, role, ...) or null.
 * Most pages should use this rather than getCurrentUser, since the role
 * lives on the profile, not on auth.users.
 */
export async function getCurrentProfile() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, phone')
    .eq('id', user.id)
    .single()

  return profile
}

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
    redirect('/dashboard')
  }
  return profile
}

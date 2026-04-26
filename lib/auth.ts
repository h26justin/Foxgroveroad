import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type UserRole = 'admin' | 'family' | 'cleaner'

export type UserProfile = {
  id: string
  email: string
  full_name: string
  role: UserRole
  phone: string | null
}

/**
 * Fetch the currently signed-in user with their profile row.
 * Returns null if not signed in.
 */
export async function getCurrentUser(): Promise<UserProfile | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, phone')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    // The trigger should have created this row, but if it hasn't, fail soft.
    return {
      id: user.id,
      email: user.email ?? '',
      full_name: user.email ?? 'Unknown',
      role: 'family',
      phone: null,
    }
  }

  return {
    id: profile.id,
    email: user.email ?? '',
    full_name: profile.full_name,
    role: profile.role as UserRole,
    phone: profile.phone,
  }
}

/**
 * Same as getCurrentUser but redirects to /login if not signed in.
 * Use in protected server components.
 */
export async function requireUser(): Promise<UserProfile> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

/**
 * Require a specific role. Redirects to /dashboard if the user is signed in
 * but doesn't have the required role.
 */
export async function requireRole(role: UserRole | UserRole[]): Promise<UserProfile> {
  const user = await requireUser()
  const allowed = Array.isArray(role) ? role : [role]
  if (!allowed.includes(user.role)) redirect('/dashboard')
  return user
}

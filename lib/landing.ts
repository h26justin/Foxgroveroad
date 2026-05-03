/**
 * Single source of truth for "where should this user land after signing in?"
 *
 * - pending → /awaiting-approval (held until an admin approves them)
 * - cleaner → /housekeeping (their actual work surface)
 * - admin / family / unknown → /dashboard
 */
export function landingPathFor(role: string | null | undefined): string {
  if (role === 'pending') return '/awaiting-approval'
  if (role === 'cleaner') return '/housekeeping'
  return '/dashboard'
}

/**
 * Single source of truth for "where should this user land after signing in?"
 *
 * - admin and family land on /dashboard (overview of bookings + tasks)
 * - cleaner lands on /housekeeping (their actual work surface — a
 *   dashboard with no current/upcoming-booking data is just empty
 *   space to them)
 *
 * Used by app/page.tsx (the root redirect after auth) and any other
 * place that needs to send a user to "their" home page.
 */
export function landingPathFor(role: string | null | undefined): string {
  if (role === 'cleaner') return '/housekeeping'
  // admin, family, or unknown role → dashboard. New users whose
  // profile hasn't been hydrated yet end up here too, which is the
  // safest fallback (it shows what they have permission to see).
  return '/dashboard'
}

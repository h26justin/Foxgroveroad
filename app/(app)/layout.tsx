import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getFeatureFlags } from '@/lib/feature-flags'
import { getActiveAnnouncementFor } from '@/lib/announcements'
import { getUserPrefs } from '@/lib/user-prefs'
import AnnouncementBanner from './AnnouncementBanner'
import TopNav from './TopNav'

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  // Pending users can't see anything in the authed shell — bounce
  // them to /awaiting-approval. Done before any data fetches so we
  // don't leak counts/booking info even if RLS happens to allow it.
  if (profile.role === 'pending') redirect('/awaiting-approval')

  // Counts for nav badges. Both queries are independent — fire in
  // parallel. Pending only matters for admins; open-issue count matters
  // for admin + cleaner.
  let pendingCount = 0
  let openIssueCount = 0
  if (profile.role === 'admin' || profile.role === 'cleaner') {
    const supabase = await createClient()

    // Build the open-issues query (always runs for admin+cleaner)
    const openIssuesPromise = supabase
      .from('issues')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')

    if (profile.role === 'admin') {
      // Admin needs both counts — run in parallel
      const pendingPromise = supabase
        .from('booking_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      const [pendingRes, issuesRes] = await Promise.all([
        pendingPromise,
        openIssuesPromise,
      ])
      pendingCount = pendingRes.count ?? 0
      openIssueCount = issuesRes.count ?? 0
    } else {
      // Cleaner only needs the open-issues count
      const issuesRes = await openIssuesPromise
      openIssueCount = issuesRes.count ?? 0
    }
  }

  // Feature flags + active announcement + per-user prefs in parallel
  const [featureFlags, announcement, userPrefs] = await Promise.all([
    getFeatureFlags(),
    getActiveAnnouncementFor(profile.id),
    getUserPrefs(profile.id),
  ])

  // Larger-text mode: applied as a class on the shell so any styles
  // that opt in via .fg-acc-large can scale.
  const accClass =
    (profile as any).accessibility_mode === 'large' ? ' fg-acc-large' : ''

  return (
    <div
      className={'fg-app-shell' + accClass}
      style={{ background: 'var(--color-cream)' }}
    >
      <TopNav
        profile={profile}
        pendingCount={pendingCount}
        openIssueCount={openIssueCount}
        featureFlags={featureFlags}
        userPrefs={userPrefs}
      />
      {announcement && (
        <AnnouncementBanner
          id={announcement.id}
          body={announcement.body}
          dismissible={announcement.dismissible}
        />
      )}
      <main>
        {/* v44: paddingBottom honours iOS home-indicator safe area when
            running as an installed PWA — prevents the last row of a
            list sitting under the indicator. */}
        <div
          className="max-w-6xl mx-auto px-4 py-6 md:px-8 md:py-10"
          style={{
            paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          }}
        >
          {children}
        </div>
      </main>
    </div>
  )
}

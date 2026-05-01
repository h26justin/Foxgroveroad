import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import TopNav from './TopNav'

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  // Counts for nav badges. Both queries are independent — fire in
  // parallel. Pending only matters for admins; open-issue count matters
  // for admin + cleaner.
  let pendingCount = 0
  let openIssueCount = 0
  if (profile.role === 'admin' || profile.role === 'cleaner') {
    const supabase = await createClient()
    const queries: Promise<any>[] = [
      profile.role === 'admin'
        ? supabase
            .from('booking_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
        : Promise.resolve({ count: 0 }),
      supabase
        .from('issues')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
    ]
    const [pendingRes, issuesRes] = await Promise.all(queries)
    pendingCount = pendingRes.count ?? 0
    openIssueCount = issuesRes.count ?? 0
  }

  return (
    <div
      className="fg-app-shell"
      style={{ background: 'var(--color-cream)' }}
    >
      <TopNav
        profile={profile}
        pendingCount={pendingCount}
        openIssueCount={openIssueCount}
      />
      <main>
        <div className="max-w-6xl mx-auto px-4 py-6 md:px-8 md:py-10">
          {children}
        </div>
      </main>
    </div>
  )
}

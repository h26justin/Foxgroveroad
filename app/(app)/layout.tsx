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

  // Pending booking-request count — only relevant for admins (renders a badge
  // on the Bookings nav item). Family/cleaner users skip the query.
  let pendingCount = 0
  if (profile.role === 'admin') {
    const supabase = await createClient()
    const { count } = await supabase
      .from('booking_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    pendingCount = count ?? 0
  }

  return (
    <div
      className="fg-app-shell"
      style={{ background: 'var(--color-cream)' }}
    >
      <TopNav profile={profile} pendingCount={pendingCount} />
      <main>
        <div className="max-w-6xl mx-auto px-4 py-6 md:px-8 md:py-10">
          {children}
        </div>
      </main>
    </div>
  )
}

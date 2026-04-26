import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  // Admin: count pending requests so we can badge the nav item
  let pendingCount = 0
  if (profile.role === 'admin') {
    const supabase = await createClient()
    const { count } = await supabase
      .from('booking_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    pendingCount = count ?? 0
  }

  const isAdmin = profile.role === 'admin'

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--color-cream)' }}>
      {/* Sidebar */}
      <aside
        className="w-64 shrink-0 border-r flex flex-col"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-warm)',
        }}
      >
        {/* Wordmark */}
        <div className="px-6 pt-8 pb-6">
          <h1
            className="text-2xl leading-tight"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
          >
            Foxgrove Road
          </h1>
          <p
            className="text-xs mt-1 fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            House operations
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-1">
          <NavLink href="/dashboard" label="Dashboard" />
          <NavLink href="/bookings" label="My bookings" />

          {isAdmin && (
            <>
              <div className="fg-section-label mt-6 mb-2 px-3">Admin</div>
              <NavLink
                href="/admin/bookings"
                label="Pending requests"
                badge={pendingCount > 0 ? pendingCount : undefined}
              />
            </>
          )}
        </nav>

        {/* Profile footer */}
        <div
          className="px-4 py-4 border-t text-sm"
          style={{ borderColor: 'var(--color-warm)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div
                className="font-medium truncate"
                style={{ color: 'var(--color-ink)' }}
              >
                {profile.full_name}
              </div>
              <div className="fg-mono text-xs" style={{ color: 'var(--color-muted)' }}>
                {profile.role}
              </div>
            </div>
            <form action="/logout" method="POST">
              <button
                type="submit"
                className="fg-btn-ghost text-xs px-2 py-1"
                title="Log out"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-10">{children}</div>
      </main>
    </div>
  )
}

function NavLink({
  href,
  label,
  badge,
}: {
  href: string
  label: string
  badge?: number
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors hover:bg-[color:var(--color-warm)]"
      style={{ color: 'var(--color-ink)' }}
    >
      <span>{label}</span>
      {badge !== undefined && (
        <span
          className="text-xs px-2 py-0.5 rounded-full fg-mono"
          style={{
            background: 'var(--color-gold)',
            color: 'white',
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  )
}

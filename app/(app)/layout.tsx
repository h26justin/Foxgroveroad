import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import MobileTabBar from './MobileTabBar'

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

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
    <div
      className="fg-app-shell md:flex"
      style={{ background: 'var(--color-cream)' }}
    >
      {/* ---------- Desktop sidebar (hidden on mobile) ---------- */}
      <aside
        className="fg-desktop-only md:flex w-64 shrink-0 border-r flex-col"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-warm)',
          minHeight: '100dvh',
        }}
      >
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

        <nav className="flex-1 px-3 space-y-1">
          <NavLink href="/today" label="Today" />
          <NavLink href="/dashboard" label="Dashboard" />
          <NavLink href="/house" label="House" />
          <NavLink href="/bookings" label="My bookings" />
          <NavLink href="/settings" label="Settings" />

          {isAdmin && (
            <>
              <div className="fg-section-label mt-6 mb-2 px-3">Admin</div>
              <NavLink
                href="/admin/bookings"
                label="Bookings calendar"
                badge={pendingCount > 0 ? pendingCount : undefined}
              />
              <NavLink href="/admin/rooms" label="Rooms" />
              <NavLink href="/admin/team" label="Team" />
            </>
          )}
        </nav>

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

      {/* ---------- Main content area ---------- */}
      <main
        className="flex-1 md:overflow-y-auto"
        style={{ minHeight: '100dvh' }}
      >
        {/* Mobile sticky top bar */}
        <div className="fg-mobile-only fg-topbar">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3 min-w-0">
              <span style={{ fontSize: 18 }}>🏠</span>
              <span className="fg-topbar-title truncate">Foxgrove Road</span>
            </div>
            <form action="/logout" method="POST">
              <button
                type="submit"
                className="text-xs fg-mono px-2 py-1"
                style={{ color: 'var(--color-muted)' }}
              >
                Log out
              </button>
            </form>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-6xl mx-auto px-4 py-6 md:px-8 md:py-10 fg-mobile-content-pad md:pb-10">
          {children}
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <MobileTabBar isAdmin={isAdmin} pendingCount={pendingCount} />
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

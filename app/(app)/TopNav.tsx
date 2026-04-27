'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Horizontal top navigation bar — sticks to the top of the viewport,
 * scrolls horizontally on narrow screens. Five tabs max for an admin
 * (Housekeeping, Bookings, House, Team, Settings); four for everyone else.
 *
 * Visual reference: OwnProperly's top-bar layout (logo | items | account).
 */
export default function TopNav({
  profile,
  pendingCount,
}: {
  profile: { id: string; full_name: string; role: string }
  pendingCount: number
}) {
  const pathname = usePathname() ?? ''
  const isAdmin = profile.role === 'admin'

  // Item definition. `match` is the path-prefix that activates the highlight.
  const items: NavItem[] = [
    {
      href: '/housekeeping',
      label: 'Housekeeping',
      icon: '🧹',
      match: '/housekeeping',
    },
    {
      href: isAdmin ? '/admin/bookings' : '/bookings',
      label: 'Bookings',
      icon: '📅',
      match: isAdmin ? '/admin/bookings' : '/bookings',
      badge: isAdmin && pendingCount > 0 ? pendingCount : undefined,
    },
    {
      href: '/house',
      label: 'House',
      icon: '🏘',
      match: '/house',
    },
    ...(isAdmin
      ? [
          {
            href: '/admin/team',
            label: 'Team',
            icon: '👥',
            match: '/admin/team',
          } satisfies NavItem,
        ]
      : []),
    {
      href: '/settings',
      label: 'Settings',
      icon: '⚙',
      match: '/settings',
    },
  ]

  return (
    <header className="fg-topnav">
      <div className="fg-topnav-inner">
        <Link href="/housekeeping" className="fg-topnav-logo">
          <span style={{ fontSize: 20 }}>🏠</span>
          <span className="fg-topnav-logo-text">Foxgrove Road</span>
        </Link>

        <nav className="fg-topnav-items" aria-label="Primary">
          {items.map((item) => {
            const isActive =
              pathname === item.match || pathname.startsWith(`${item.match}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`fg-topnav-item${isActive ? ' is-active' : ''}`}
              >
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span className="fg-topnav-badge">{item.badge}</span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="fg-topnav-account">
          <span className="fg-topnav-name">{profile.full_name}</span>
          <form action="/logout" method="POST">
            <button
              type="submit"
              className="fg-topnav-logout"
              title="Log out"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}

type NavItem = {
  href: string
  label: string
  icon: string
  match: string
  badge?: number
}

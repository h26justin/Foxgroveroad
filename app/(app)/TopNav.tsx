'use client'

import Image from 'next/image'
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
  openIssueCount,
  featureFlags,
}: {
  profile: { id: string; full_name: string; role: string }
  pendingCount: number
  openIssueCount: number
  featureFlags: Record<string, boolean>
}) {
  const pathname = usePathname() ?? ''
  const isAdmin = profile.role === 'admin'
  const flagOn = (name: string) => featureFlags[name] !== false

  // Item definition. `match` is the path-prefix that activates the highlight.
  const items: NavItem[] = [
    // Dashboard tab — admin and family only. Cleaners go straight to
    // Housekeeping and don't need a dashboard. Badge mirrors the House
    // tab's pending-bookings count so admins can see it from anywhere.
    ...(profile.role !== 'cleaner'
      ? [
          {
            href: '/dashboard',
            label: 'Dashboard',
            icon: '📊',
            match: '/dashboard',
            badge: isAdmin && pendingCount > 0 ? pendingCount : undefined,
          } satisfies NavItem,
        ]
      : []),
    {
      href: '/house',
      label: 'House',
      icon: '🏘',
      match: '/house',
      badge: isAdmin && pendingCount > 0 ? pendingCount : undefined,
    },
    {
      href: '/housekeeping',
      label: 'Housekeeping',
      icon: '🧹',
      match: '/housekeeping',
    },
    {
      href: '/bookings',
      label: 'Bookings',
      icon: '📅',
      match: '/bookings',
    },
    // Issues tab — visible to admin + cleaner. Badge shows the open count.
    ...((profile.role === 'admin' || profile.role === 'cleaner') &&
    flagOn('issues')
      ? [
          {
            href: '/issues',
            label: 'Issues',
            icon: '⚠',
            match: '/issues',
            badge: openIssueCount > 0 ? openIssueCount : undefined,
          } satisfies NavItem,
        ]
      : []),
    ...((profile.role === 'admin' || profile.role === 'cleaner') &&
    flagOn('linen')
      ? [
          {
            href: '/linen',
            label: 'Linen',
            icon: '🧺',
            match: '/linen',
          } satisfies NavItem,
        ]
      : []),
    ...(isAdmin
      ? [
          {
            href: '/admin/team',
            label: 'Team',
            icon: '👥',
            match: '/admin/team',
          } satisfies NavItem,
          ...(flagOn('guests')
            ? [
                {
                  href: '/admin/guests',
                  label: 'Guests',
                  icon: '🧳',
                  match: '/admin/guests',
                } satisfies NavItem,
              ]
            : []),
          ...(flagOn('pay')
            ? [
                {
                  href: '/pay',
                  label: 'Pay',
                  icon: '💷',
                  match: '/pay',
                } satisfies NavItem,
              ]
            : []),
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
        <Link href="/house" className="fg-topnav-logo" aria-label="Foxgrove Road home">
          <Image
            src="/logo-foxgrove-mark.png"
            alt=""
            width={46}
            height={32}
            priority
            className="fg-topnav-logo-img"
          />
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

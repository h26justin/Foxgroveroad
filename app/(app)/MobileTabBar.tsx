'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Bottom tab bar shown only on mobile (hidden on desktop via .fg-mobile-only).
 * Four primary destinations: Today, Bookings, Rooms (admin) / House (others), Settings.
 *
 * Uses inline SVGs (no extra deps) styled by .fg-tabbar in globals.css.
 */
export default function MobileTabBar({
  isAdmin,
  pendingCount,
}: {
  isAdmin: boolean
  pendingCount: number
}) {
  const pathname = usePathname() ?? ''

  // For non-admins, show House instead of Rooms (which is admin-only).
  const tertiary = isAdmin
    ? { href: '/admin/rooms', label: 'Rooms', match: '/admin/rooms', icon: <RoomsIcon /> }
    : { href: '/house', label: 'House', match: '/house', icon: <RoomsIcon /> }

  const tabs: TabDef[] = [
    { href: '/today', label: 'Today', match: '/today', icon: <CheckIcon /> },
    {
      href: isAdmin ? '/admin/bookings' : '/bookings',
      label: 'Bookings',
      match: isAdmin ? '/admin/bookings' : '/bookings',
      icon: <CalendarIcon />,
      badge: isAdmin && pendingCount > 0 ? pendingCount : undefined,
    },
    tertiary,
    { href: '/settings', label: 'Settings', match: '/settings', icon: <CogIcon /> },
  ]

  return (
    <nav className="fg-mobile-only fg-tabbar" aria-label="Primary">
      {tabs.map((tab) => {
        const isActive =
          pathname === tab.match || pathname.startsWith(`${tab.match}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`fg-tabbar-item${isActive ? ' is-active' : ''}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className="fg-tabbar-badge">{tab.badge}</span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

type TabDef = {
  href: string
  label: string
  match: string
  icon: React.ReactNode
  badge?: number
}

/* ---------- Inline icon components ---------- */

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 11.5l2.5 2.5L17 8" />
      <rect x="3" y="3" width="18" height="18" rx="3" />
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  )
}
function RoomsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  )
}
function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

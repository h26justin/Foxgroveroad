'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * Top navigation bar.
 *
 * v47: switched from "every tab as a chip" (could grow to 14 items
 * for an admin) to a tight primary nav + a "More" dropdown. Primary
 * stays at 4–5 items per role; everything else lives inside the
 * dropdown, grouped into "Sections" and "Admin tools".
 */

type UserPrefs = {
  show_expenses: boolean
  show_contacts: boolean
  show_chat: boolean
  show_wiki: boolean
  email_notifications: boolean
}

type NavItem = {
  href: string
  label: string
  icon: string
  match: string
  badge?: number
}

export default function TopNav({
  profile,
  pendingCount,
  openIssueCount,
  featureFlags,
  userPrefs,
}: {
  profile: { id: string; full_name: string; role: string }
  pendingCount: number
  openIssueCount: number
  featureFlags: Record<string, boolean>
  userPrefs: UserPrefs
}) {
  const pathname = usePathname() ?? ''
  const isAdmin = profile.role === 'admin'
  const isCleaner = profile.role === 'cleaner'
  const flagOn = (name: string) => featureFlags[name] !== false

  // ─── PRIMARY NAV ───────────────────────────────────────────────────
  // Role-tailored, 4–5 items max. These are the routes people land on
  // multiple times a day.
  const primary: NavItem[] = []

  if (!isCleaner) {
    primary.push({
      href: '/dashboard',
      label: 'Dashboard',
      icon: '📊',
      match: '/dashboard',
      badge: isAdmin && pendingCount > 0 ? pendingCount : undefined,
    })
  }

  primary.push({
    href: '/house',
    label: 'House',
    icon: '🏘',
    match: '/house',
    badge: isAdmin && pendingCount > 0 ? pendingCount : undefined,
  })

  if (isCleaner || isAdmin) {
    primary.push({
      href: '/housekeeping',
      label: 'Housekeeping',
      icon: '🧹',
      match: '/housekeeping',
    })
  }

  if (!isCleaner) {
    primary.push({
      href: '/bookings',
      label: 'Bookings',
      icon: '📅',
      match: '/bookings',
    })
  }

  // Cleaners get Issues primary; admins get it under More.
  if (isCleaner && flagOn('issues')) {
    primary.push({
      href: '/issues',
      label: 'Issues',
      icon: '⚠',
      match: '/issues',
      badge: openIssueCount > 0 ? openIssueCount : undefined,
    })
  }

  if (userPrefs.show_chat) {
    primary.push({
      href: '/chat',
      label: 'Chat',
      icon: '💬',
      match: '/chat',
    })
  }

  // ─── MORE DROPDOWN ─────────────────────────────────────────────────
  // Two visual groups inside the menu: "Sections" (broadly relevant) and
  // "Admin tools" (admin only). Empty groups are skipped.

  const sectionItems: NavItem[] = []

  if (isAdmin && flagOn('issues')) {
    sectionItems.push({
      href: '/issues',
      label: 'Issues',
      icon: '⚠',
      match: '/issues',
      badge: openIssueCount > 0 ? openIssueCount : undefined,
    })
  }

  if ((isAdmin || isCleaner) && flagOn('linen')) {
    sectionItems.push({
      href: '/linen',
      label: 'Linen',
      icon: '🧺',
      match: '/linen',
    })
  }

  if (userPrefs.show_contacts) {
    sectionItems.push({
      href: '/contacts',
      label: 'Contacts',
      icon: '📒',
      match: '/contacts',
    })
  }

  if (userPrefs.show_expenses) {
    sectionItems.push({
      href: '/expenses',
      label: 'Expenses',
      icon: '💷',
      match: '/expenses',
    })
  }

  if (userPrefs.show_wiki) {
    sectionItems.push({
      href: '/wiki',
      label: 'How-to',
      icon: '📖',
      match: '/wiki',
    })
  }

  const adminItems: NavItem[] = []
  if (isAdmin) {
    adminItems.push({
      href: '/admin/team',
      label: 'Team',
      icon: '👥',
      match: '/admin/team',
    })
    if (flagOn('guests')) {
      adminItems.push({
        href: '/admin/guests',
        label: 'Guests',
        icon: '🧳',
        match: '/admin/guests',
      })
    }
    if (flagOn('pay')) {
      adminItems.push({
        href: '/pay',
        label: 'Pay',
        icon: '💰',
        match: '/pay',
      })
    }
    adminItems.push({
      href: '/admin/house-info',
      label: 'House info',
      icon: '🏠',
      match: '/admin/house-info',
    })
    adminItems.push({
      href: '/admin/announcements',
      label: 'Announcements',
      icon: '📣',
      match: '/admin/announcements',
    })
    adminItems.push({
      href: '/admin/audit',
      label: 'Audit log',
      icon: '📜',
      match: '/admin/audit',
    })
  }

  const hasMoreItems = sectionItems.length > 0 || adminItems.length > 0

  return (
    <header className="fg-topnav">
      <div className="fg-topnav-inner">
        <Link
          href="/house"
          prefetch={true}
          className="fg-topnav-logo"
          aria-label="Foxgrove Road home"
        >
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
          {primary.map((item) => (
            <PrimaryLink key={item.href} item={item} pathname={pathname} />
          ))}
          {hasMoreItems && (
            <MoreMenu
              sectionItems={sectionItems}
              adminItems={adminItems}
              pathname={pathname}
            />
          )}
        </nav>

        <div className="fg-topnav-account">
          <span className="fg-topnav-name">{profile.full_name}</span>
          <Link
            href="/settings"
            prefetch={true}
            className="fg-topnav-settings"
            aria-label="Settings"
            title="Settings"
          >
            ⚙
          </Link>
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

function PrimaryLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive =
    pathname === item.match || pathname.startsWith(`${item.match}/`)
  return (
    <Link
      href={item.href}
      prefetch={true}
      className={`fg-topnav-item${isActive ? ' is-active' : ''}`}
    >
      <span style={{ fontSize: 14 }}>{item.icon}</span>
      <span>{item.label}</span>
      {item.badge !== undefined && (
        <span className="fg-topnav-badge">{item.badge}</span>
      )}
    </Link>
  )
}

function MoreMenu({
  sectionItems,
  adminItems,
  pathname,
}: {
  sectionItems: NavItem[]
  adminItems: NavItem[]
  pathname: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const containsActive =
    sectionItems.some(
      (i) => pathname === i.match || pathname.startsWith(`${i.match}/`),
    ) ||
    adminItems.some(
      (i) => pathname === i.match || pathname.startsWith(`${i.match}/`),
    )

  return (
    <div ref={ref} className="fg-topnav-more">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`fg-topnav-item${containsActive ? ' is-active' : ''}`}
      >
        <span style={{ fontSize: 14 }}>⋯</span>
        <span>More</span>
        <span
          aria-hidden
          style={{
            fontSize: 9,
            opacity: 0.7,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div role="menu" className="fg-topnav-more-menu">
          {sectionItems.length > 0 && (
            <>
              <div className="fg-topnav-more-group-label">Sections</div>
              {sectionItems.map((item) => (
                <MoreMenuItem
                  key={item.href}
                  item={item}
                  pathname={pathname}
                />
              ))}
            </>
          )}
          {adminItems.length > 0 && (
            <>
              {sectionItems.length > 0 && (
                <div className="fg-topnav-more-divider" />
              )}
              <div className="fg-topnav-more-group-label">Admin</div>
              {adminItems.map((item) => (
                <MoreMenuItem
                  key={item.href}
                  item={item}
                  pathname={pathname}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MoreMenuItem({
  item,
  pathname,
}: {
  item: NavItem
  pathname: string
}) {
  const isActive =
    pathname === item.match || pathname.startsWith(`${item.match}/`)
  return (
    <Link
      href={item.href}
      prefetch={true}
      role="menuitem"
      className={`fg-topnav-more-item${isActive ? ' is-active' : ''}`}
    >
      <span aria-hidden style={{ fontSize: 16, width: 22, textAlign: 'center' }}>
        {item.icon}
      </span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge !== undefined && (
        <span className="fg-topnav-badge">{item.badge}</span>
      )}
    </Link>
  )
}

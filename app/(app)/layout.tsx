import Link from 'next/link'
import { requireUser } from '@/lib/auth'

const ROLE_PILL: Record<string, string> = {
  admin: 'fg-pill-gold',
  cleaner: 'fg-pill-blue',
  family: 'fg-pill-green',
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  const navItems: { href: string; label: string }[] = [
    { href: '/dashboard', label: 'Dashboard' },
  ]

  if (user.role === 'admin') {
    navItems.push(
      { href: '/map', label: 'House map' },
      { href: '/bookings', label: 'Bookings' },
      { href: '/cleaners', label: 'Cleaners' },
      { href: '/tasks', label: 'Tasks' },
      { href: '/linen', label: 'Linen' }
    )
  } else if (user.role === 'cleaner') {
    navItems.push(
      { href: '/today', label: 'Today' },
      { href: '/schedule', label: 'My schedule' }
    )
  } else {
    navItems.push(
      { href: '/book', label: 'Book a room' },
      { href: '/my-stays', label: 'My stays' }
    )
  }

  const pillClass = ROLE_PILL[user.role] ?? 'fg-pill-muted'

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Sidebar */}
      <aside
        className="border-b px-5 py-5 md:w-72 md:border-b-0 md:border-r md:px-7 md:py-8"
        style={{
          background: 'var(--color-cream)',
          borderColor: 'var(--color-warm)',
        }}
      >
        <div className="flex items-center justify-between md:block">
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">
              Foxgrove Road
            </h1>
            <p className="fg-mono mt-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)]">
              House operations
            </p>

            <div className="mt-5 flex items-center gap-2">
              <span className={`fg-pill ${pillClass}`}>{user.role}</span>
            </div>
            <p className="fg-mono mt-2 text-xs text-[color:var(--color-ink)]">
              {user.full_name}
            </p>
            <p className="fg-mono text-[11px] text-[color:var(--color-muted)]">
              {user.email}
            </p>
          </div>

          <form action="/logout" method="post" className="md:hidden">
            <button className="fg-mono text-xs text-[color:var(--color-muted)] underline-offset-4 hover:underline">
              Log out
            </button>
          </form>
        </div>

        {/* Desktop nav */}
        <nav className="mt-8 hidden space-y-0.5 md:block">
          <p className="fg-mono mb-2 text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-faint)]">
            Menu
          </p>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="fg-mono block rounded-lg px-3 py-2 text-sm text-[color:var(--color-ink)] transition hover:bg-[rgba(45,60,74,0.06)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <form action="/logout" method="post" className="mt-8 hidden md:block">
          <button className="fg-mono block w-full rounded-lg px-3 py-2 text-left text-xs text-[color:var(--color-muted)] transition hover:bg-[rgba(204,51,51,0.06)] hover:text-[color:var(--color-red)]">
            Log out
          </button>
        </form>

        {/* Mobile horizontal nav */}
        <nav className="mt-4 flex gap-2 overflow-x-auto md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="fg-chip whitespace-nowrap"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 px-5 py-6 md:px-10 md:py-12">{children}</main>
    </div>
  )
}

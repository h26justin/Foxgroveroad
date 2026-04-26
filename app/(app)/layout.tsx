import Link from 'next/link'
import { requireUser } from '@/lib/auth'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  // Build nav items based on role
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
    // family
    navItems.push(
      { href: '/book', label: 'Book a room' },
      { href: '/my-stays', label: 'My stays' }
    )
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="border-b border-stone-200 bg-white px-4 py-4 md:w-64 md:border-b-0 md:border-r md:px-6 md:py-6">
        <div className="flex items-center justify-between md:block">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Foxgrove Road</h1>
            <p className="mt-0.5 text-xs text-stone-500">{user.full_name}</p>
            <span className="mt-1 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
              {user.role}
            </span>
          </div>
          <form action="/logout" method="post" className="md:hidden">
            <button className="text-sm text-stone-500 hover:text-stone-900">Log out</button>
          </form>
        </div>

        <nav className="mt-6 hidden space-y-1 md:block">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <form action="/logout" method="post" className="mt-6 hidden md:block">
          <button className="block w-full rounded-lg px-3 py-2 text-left text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-900">
            Log out
          </button>
        </form>

        {/* mobile horizontal nav */}
        <nav className="mt-4 flex gap-2 overflow-x-auto md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-full bg-stone-100 px-3 py-1.5 text-sm text-stone-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 px-4 py-6 md:px-8 md:py-10">{children}</main>
    </div>
  )
}

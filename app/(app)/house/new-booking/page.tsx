import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import NewBookingClient from './NewBookingClient'

export default async function NewBookingPage() {
  const [profile, supabase] = await Promise.all([
    requireProfile(),
    createClient(),
  ])
  if (profile.role !== 'admin') redirect('/house')

  // List of users the admin can book on behalf of. We surface admin +
  // family roles (cleaners typically aren't booking stays).
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['admin', 'family'])
    .order('full_name')

  const users = ((profiles as any[]) ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name ?? 'Unnamed',
    role: p.role,
  }))

  return (
    <div className="max-w-xl">
      <div className="mb-4">
        <Link
          href="/house"
          className="text-xs fg-mono inline-flex items-center gap-1"
          style={{ color: 'var(--color-muted)' }}
        >
          ← House
        </Link>
      </div>
      <h1
        className="text-3xl mb-1"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
      >
        New booking
      </h1>
      <p
        className="text-sm fg-mono mb-6"
        style={{ color: 'var(--color-muted)' }}
      >
        Create an approved booking on someone&apos;s behalf — skips the
        request-and-approve flow.
      </p>
      <NewBookingClient users={users} />
    </div>
  )
}

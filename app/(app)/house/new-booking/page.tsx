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

  // All known guests (linked or not). Admin picks from this list when
  // adding existing guests to a booking.
  const { data: guestsRaw } = await supabase
    .from('guests')
    .select(
      'id, full_name, linked_profile_id, profiles:profiles!guests_linked_profile_id_fkey(role)',
    )
    .order('full_name')

  const allGuests = ((guestsRaw as any[]) ?? []).map((g) => ({
    id: g.id,
    full_name: g.full_name,
    linked: !!g.linked_profile_id,
    role: (g.profiles as any)?.role ?? null,
  }))

  // Account holders not yet linked to any guest — for the optional
  // "link to account" picker on a typed-new guest.
  const { data: existingLinks } = await supabase
    .from('guests')
    .select('linked_profile_id')
    .not('linked_profile_id', 'is', null)
  const linkedSet = new Set(
    ((existingLinks as any[]) ?? [])
      .map((g) => g.linked_profile_id)
      .filter(Boolean),
  )
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['admin', 'family'])
    .order('full_name')
  const linkableProfiles = ((allProfiles as any[]) ?? []).filter(
    (p) => !linkedSet.has(p.id),
  )

  return (
    <div className="max-w-2xl">
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
        Pick the dates, list who&apos;s staying, and we&apos;ll take you
        to the booking panel to assign beds.
      </p>
      <NewBookingClient
        allGuests={allGuests}
        linkableProfiles={linkableProfiles}
      />
    </div>
  )
}

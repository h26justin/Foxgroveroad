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

  // The "book on behalf of" picker shows guests who have a linked
  // account (since booking_requests requires a profile-id requester).
  // For unlinked guests (the casual ones), admin can either link them
  // first or assign them to bed pills after creating a booking.
  const { data: guestsRaw } = await supabase
    .from('guests')
    .select(
      'id, full_name, linked_profile_id, profiles:profiles!guests_linked_profile_id_fkey(role)',
    )
    .not('linked_profile_id', 'is', null)
    .order('full_name')

  const guestsWithAccounts = ((guestsRaw as any[]) ?? []).map((g) => ({
    guest_id: g.id,
    profile_id: g.linked_profile_id as string,
    full_name: g.full_name,
    role: (g.profiles as any)?.role ?? 'family',
  }))

  // Profiles available for linking when admin chooses "+ Add new guest"
  // — i.e. account holders not yet linked to any guest record.
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
        Create an approved booking on someone&apos;s behalf. The list
        shows guests with linked accounts — for guests without
        accounts, create the booking and assign them to beds afterward.
      </p>
      <NewBookingClient
        guestsWithAccounts={guestsWithAccounts}
        linkableProfiles={linkableProfiles}
      />
    </div>
  )
}

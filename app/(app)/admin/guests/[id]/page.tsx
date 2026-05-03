import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import GuestDetailClient from './GuestDetailClient'

export const revalidate = 30

export default async function GuestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [me, supabase, p] = await Promise.all([
    requireProfile(),
    createClient(),
    params,
  ])
  if (me.role !== 'admin') redirect('/house')

  const { id } = p
  if (!id) notFound()

  // Guest + linked profile
  const { data: guestRow, error: guestErr } = await supabase
    .from('guests')
    .select(
      'id, full_name, linked_profile_id, dietary_notes, allergies, room_preference, things_they_bring, general_notes, profiles:profiles!guests_linked_profile_id_fkey(id, full_name, role, phone)',
    )
    .eq('id', id)
    .single()

  if (guestErr || !guestRow) notFound()
  const guest = guestRow as any

  // Stay history — two sources, merged & deduped:
  //   1. bookings.guest_id matches (the canonical link)
  //   2. if guest has linked_profile_id, booking_requests.requested_by matches
  // We collect a list of "stays": { check_in, check_out, status, source, request_id, notes? }
  type Stay = {
    key: string
    check_in: string
    check_out: string
    status: string
    notes: string | null
    source: 'as_guest' | 'as_requester'
    request_id: string | null
  }
  const stays: Stay[] = []

  const { data: bedBookings } = await supabase
    .from('bookings')
    .select('id, request_id, check_in, check_out, status')
    .eq('guest_id', guest.id)
    .order('check_in', { ascending: false })
    .limit(50)
  for (const b of (bedBookings as any[]) ?? []) {
    stays.push({
      key: `bed:${b.id}`,
      check_in: b.check_in,
      check_out: b.check_out,
      status: b.status,
      notes: null,
      source: 'as_guest',
      request_id: b.request_id ?? null,
    })
  }

  if (guest.linked_profile_id) {
    const { data: requests } = await supabase
      .from('booking_requests')
      .select('id, check_in, check_out, status, notes')
      .eq('requested_by', guest.linked_profile_id)
      .order('check_in', { ascending: false })
      .limit(50)
    for (const r of (requests as any[]) ?? []) {
      stays.push({
        key: `req:${r.id}`,
        check_in: r.check_in,
        check_out: r.check_out,
        status: r.status,
        notes: r.notes,
        source: 'as_requester',
        request_id: r.id,
      })
    }
  }

  // Dedupe by request_id where present (we don't want the same stay
  // appearing once "as guest" and again "as requester")
  const dedupedByRequest = new Map<string, Stay>()
  const uniqueNoRequest: Stay[] = []
  for (const s of stays) {
    if (s.request_id) {
      const existing = dedupedByRequest.get(s.request_id)
      if (!existing) {
        dedupedByRequest.set(s.request_id, s)
      } else {
        // Prefer 'as_requester' since it has notes
        if (s.source === 'as_requester') dedupedByRequest.set(s.request_id, s)
      }
    } else {
      uniqueNoRequest.push(s)
    }
  }
  const merged = [...dedupedByRequest.values(), ...uniqueNoRequest].sort(
    (a, b) => (a.check_in > b.check_in ? -1 : 1),
  )

  // Linkable profiles (for the link-to-account form, if not already linked)
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['admin', 'family'])
    .order('full_name')

  const { data: existingLinks } = await supabase
    .from('guests')
    .select('linked_profile_id')
    .not('linked_profile_id', 'is', null)
  const linkedSet = new Set(
    ((existingLinks as any[]) ?? [])
      .map((g) => g.linked_profile_id)
      .filter(Boolean),
  )
  const linkableProfiles = ((allProfiles as any[]) ?? []).filter(
    (p) => !linkedSet.has(p.id),
  )

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <Link
          href="/admin/guests"
          className="text-xs fg-mono inline-flex items-center gap-1"
          style={{ color: 'var(--color-muted)' }}
        >
          ← All guests
        </Link>
      </div>

      <GuestDetailClient
        guest={{
          id: guest.id,
          full_name: guest.full_name,
          linked_profile_id: guest.linked_profile_id,
          dietary_notes: guest.dietary_notes ?? '',
          allergies: guest.allergies ?? '',
          room_preference: guest.room_preference ?? '',
          things_they_bring: guest.things_they_bring ?? '',
          general_notes: guest.general_notes ?? '',
          linked_profile: guest.profiles
            ? {
                id: (guest.profiles as any).id,
                full_name: (guest.profiles as any).full_name,
                role: (guest.profiles as any).role,
                phone: (guest.profiles as any).phone,
              }
            : null,
        }}
        linkableProfiles={linkableProfiles}
        stays={merged}
      />
    </div>
  )
}

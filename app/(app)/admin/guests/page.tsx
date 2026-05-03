import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isFeatureEnabled } from '@/lib/feature-flags'
import AddGuestButton from './AddGuestButton'

export const revalidate = 30

/**
 * Admin-only list of every guest the house knows about: linked
 * account holders, plus one-off names with notes.
 */
export default async function GuestsIndexPage() {
  const [profile, supabase] = await Promise.all([
    requireProfile(),
    createClient(),
  ])
  if (profile.role !== 'admin') redirect('/house')
  if (!(await isFeatureEnabled('guests'))) redirect('/housekeeping')

  // Fetch all guests + their linked profile data (when linked)
  const { data: guestsRaw } = await supabase
    .from('guests')
    .select(
      'id, full_name, linked_profile_id, dietary_notes, allergies, room_preference, things_they_bring, general_notes, profiles:profiles!guests_linked_profile_id_fkey(role, phone)',
    )
    .order('full_name')

  const guests = (guestsRaw as any[]) ?? []
  const guestIds = guests.map((g) => g.id)

  // Count stays per guest from bookings.guest_id, plus from
  // booking_requests.requested_by → profile → guest link for the
  // legacy "this is the requester's record" pattern.
  // For simplicity, we count direct guest_id matches first.
  let stayCounts: Record<string, { total: number; upcoming: number; lastStay: string | null }> = {}
  if (guestIds.length > 0) {
    const todayISO = new Date().toISOString().slice(0, 10)
    const { data: bookingRows } = await supabase
      .from('bookings')
      .select('guest_id, check_in, check_out, status')
      .in('guest_id', guestIds)
      .eq('status', 'approved')
    for (const b of (bookingRows as any[]) ?? []) {
      const cur = stayCounts[b.guest_id] ?? {
        total: 0,
        upcoming: 0,
        lastStay: null as string | null,
      }
      cur.total += 1
      if (b.check_in >= todayISO) cur.upcoming += 1
      if (b.check_in < todayISO && (!cur.lastStay || b.check_in > cur.lastStay)) {
        cur.lastStay = b.check_in
      }
      stayCounts[b.guest_id] = cur
    }

    // Also pick up bookings via the linked profile's requests, so
    // account holders show stays even before bed-pill linking is built.
    const linkedGuests = guests.filter((g) => g.linked_profile_id)
    if (linkedGuests.length > 0) {
      const linkedProfileIds = linkedGuests.map((g) => g.linked_profile_id)
      const { data: reqRows } = await supabase
        .from('booking_requests')
        .select('requested_by, check_in, status')
        .in('requested_by', linkedProfileIds)
        .eq('status', 'approved')
      for (const r of (reqRows as any[]) ?? []) {
        const guest = linkedGuests.find(
          (g) => g.linked_profile_id === r.requested_by,
        )
        if (!guest) continue
        const cur = stayCounts[guest.id] ?? {
          total: 0,
          upcoming: 0,
          lastStay: null as string | null,
        }
        cur.total += 1
        if (r.check_in >= todayISO) cur.upcoming += 1
        if (r.check_in < todayISO && (!cur.lastStay || r.check_in > cur.lastStay)) {
          cur.lastStay = r.check_in
        }
        stayCounts[guest.id] = cur
      }
    }
  }

  // Profiles available for linking from the quick-add form.
  // We expose admin + family roles that aren't already linked to a guest.
  const linkedProfileIds = new Set(
    guests.map((g) => g.linked_profile_id).filter(Boolean),
  )
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['admin', 'family'])
    .order('full_name')
  const linkableProfiles = ((allProfiles as any[]) ?? []).filter(
    (p) => !linkedProfileIds.has(p.id),
  )

  function hasAnyNotes(g: any): boolean {
    return Boolean(
      g.dietary_notes ||
        g.allergies ||
        g.room_preference ||
        g.things_they_bring ||
        g.general_notes,
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1
            className="text-3xl mb-1"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            Guests
          </h1>
          <p
            className="text-sm fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            Notes and stay history for everyone who stays at the house.
            Add anyone — they don&apos;t need an account.
          </p>
        </div>
        <AddGuestButton linkableProfiles={linkableProfiles} />
      </div>

      {guests.length === 0 ? (
        <div className="fg-card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No guests recorded yet. Click &ldquo;+ Add guest&rdquo; to add the
            first one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {guests.map((g) => {
            const s = stayCounts[g.id] ?? {
              total: 0,
              upcoming: 0,
              lastStay: null,
            }
            const flags: string[] = []
            if (g.allergies) flags.push('⚠ allergies')
            if (g.dietary_notes) flags.push('🍴 dietary')
            if (g.room_preference) flags.push('🛏 room')
            if (g.things_they_bring) flags.push('🎒 brings')
            if (g.general_notes) flags.push('💭 notes')

            return (
              <Link
                key={g.id}
                href={`/admin/guests/${g.id}`}
                className="fg-card p-4 block hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="text-base"
                        style={{
                          fontFamily: 'var(--font-serif)',
                          color: 'var(--color-ink)',
                        }}
                      >
                        {g.full_name}
                      </span>
                      {g.linked_profile_id && (
                        <span
                          className="fg-pill text-xs"
                          style={{
                            background: 'var(--color-warm)',
                            color: 'var(--color-muted)',
                          }}
                        >
                          🔗 has account ·{' '}
                          {(g.profiles as any)?.role ?? 'member'}
                        </span>
                      )}
                      {!hasAnyNotes(g) && (
                        <span
                          className="text-xs fg-mono"
                          style={{ color: 'var(--color-muted)' }}
                        >
                          no notes yet
                        </span>
                      )}
                    </div>
                    {flags.length > 0 && (
                      <div
                        className="text-xs fg-mono mt-1"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        {flags.join(' · ')}
                      </div>
                    )}
                    <div
                      className="text-xs fg-mono mt-1"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {s.total} stay{s.total === 1 ? '' : 's'}
                      {s.upcoming > 0 && ` · ${s.upcoming} upcoming`}
                      {s.lastStay &&
                        ` · last stayed ${new Date(
                          s.lastStay + 'T00:00:00',
                        ).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}`}
                    </div>
                  </div>
                  <span
                    className="text-xs fg-mono"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    →
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

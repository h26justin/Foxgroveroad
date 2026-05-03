import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const revalidate = 30

/**
 * Admin-only list of all family + admin profiles. Cleaners' profiles
 * aren't surfaced here because the notes are about *guests*, not staff.
 */
export default async function ProfilesIndexPage() {
  const [profile, supabase] = await Promise.all([
    requireProfile(),
    createClient(),
  ])
  if (profile.role !== 'admin') redirect('/house')

  // Fetch all family + admin profiles with their note fields
  // (so we can show the "has notes" indicator), plus a count of past
  // bookings for each.
  const { data: profilesRaw } = await supabase
    .from('profiles')
    .select(
      'id, full_name, role, phone, dietary_notes, allergies, room_preference, things_they_bring, general_notes',
    )
    .in('role', ['admin', 'family'])
    .order('full_name')

  const profiles = (profilesRaw as any[]) ?? []
  const profileIds = profiles.map((p) => p.id)

  // Count bookings per profile in a single query
  const { data: bookingsRaw } =
    profileIds.length > 0
      ? await supabase
          .from('booking_requests')
          .select('id, requested_by, status, check_in')
          .in('requested_by', profileIds)
      : { data: [] as any[] }

  const bookings = (bookingsRaw as any[]) ?? []
  const todayISO = new Date().toISOString().slice(0, 10)
  const stats = new Map<
    string,
    { total: number; upcoming: number; lastStay: string | null }
  >()
  for (const b of bookings) {
    const cur = stats.get(b.requested_by) ?? {
      total: 0,
      upcoming: 0,
      lastStay: null as string | null,
    }
    if (b.status === 'approved' || b.status === 'cancelled') {
      cur.total += 1
      if (b.check_in >= todayISO) cur.upcoming += 1
      if (b.status === 'approved' && b.check_in < todayISO) {
        if (!cur.lastStay || b.check_in > cur.lastStay) cur.lastStay = b.check_in
      }
    }
    stats.set(b.requested_by, cur)
  }

  function hasAnyNotes(p: any): boolean {
    return Boolean(
      p.dietary_notes ||
        p.allergies ||
        p.room_preference ||
        p.things_they_bring ||
        p.general_notes,
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1
          className="text-3xl mb-1"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          Guest profiles
        </h1>
        <p
          className="text-sm fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          Notes and stay history for everyone with an account.
        </p>
      </div>

      {profiles.length === 0 ? (
        <div className="fg-card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No profiles yet. Invite people from the Team page.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => {
            const s = stats.get(p.id) ?? {
              total: 0,
              upcoming: 0,
              lastStay: null,
            }
            const flags: string[] = []
            if (p.allergies) flags.push('⚠ allergies')
            if (p.dietary_notes) flags.push('🍴 dietary')
            if (p.room_preference) flags.push('🛏 room')
            if (p.things_they_bring) flags.push('🎒 brings')
            if (p.general_notes) flags.push('💭 notes')

            return (
              <Link
                key={p.id}
                href={`/admin/profiles/${p.id}`}
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
                        {p.full_name ?? 'Unnamed'}
                      </span>
                      <span
                        className="fg-pill text-xs"
                        style={{
                          background: 'var(--color-warm)',
                          color: 'var(--color-muted)',
                        }}
                      >
                        {p.role}
                      </span>
                      {p.id === profile.id && (
                        <span className="fg-pill fg-pill-blue text-xs">
                          you
                        </span>
                      )}
                      {!hasAnyNotes(p) && (
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
                      {s.upcoming > 0 &&
                        ` · ${s.upcoming} upcoming`}
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

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import ProfileEditClient from './ProfileEditClient'

export const revalidate = 30

export default async function ProfileDetailPage({
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

  // Profile + bookings in parallel
  const [profileRes, bookingsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, full_name, role, phone, dietary_notes, allergies, room_preference, things_they_bring, general_notes',
      )
      .eq('id', id)
      .single(),
    supabase
      .from('booking_requests')
      .select(
        'id, check_in, check_out, adults, children, status, notes, decided_at',
      )
      .eq('requested_by', id)
      .order('check_in', { ascending: false })
      .limit(50),
  ])

  if (profileRes.error || !profileRes.data) notFound()

  const profile = profileRes.data as any
  const bookings = (bookingsRes.data as any[]) ?? []

  const todayISO = new Date().toISOString().slice(0, 10)
  const upcoming = bookings.filter(
    (b) => b.status === 'approved' && b.check_in >= todayISO,
  )
  const past = bookings.filter(
    (b) => b.status === 'approved' && b.check_in < todayISO,
  )
  const declined = bookings.filter((b) => b.status === 'declined')
  const cancelled = bookings.filter((b) => b.status === 'cancelled')
  const pending = bookings.filter((b) => b.status === 'pending')

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <Link
          href="/admin/profiles"
          className="text-xs fg-mono inline-flex items-center gap-1"
          style={{ color: 'var(--color-muted)' }}
        >
          ← All profiles
        </Link>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h1
            className="text-3xl"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            {profile.full_name ?? 'Unnamed'}
          </h1>
          <span
            className="fg-pill text-xs"
            style={{
              background: 'var(--color-warm)',
              color: 'var(--color-muted)',
            }}
          >
            {profile.role}
          </span>
        </div>
        {profile.phone && (
          <p
            className="text-sm fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            📱 {profile.phone}
          </p>
        )}
      </div>

      {/* Notes (editable) */}
      <section className="mb-8">
        <h2 className="fg-section-label mb-3">Notes</h2>
        <ProfileEditClient
          profileId={profile.id}
          initial={{
            dietary_notes: profile.dietary_notes ?? '',
            allergies: profile.allergies ?? '',
            room_preference: profile.room_preference ?? '',
            things_they_bring: profile.things_they_bring ?? '',
            general_notes: profile.general_notes ?? '',
          }}
        />
      </section>

      {/* Stay history */}
      <section>
        <h2 className="fg-section-label mb-3">Stay history</h2>

        {bookings.length === 0 ? (
          <div className="fg-card p-6 text-center">
            <p
              className="text-sm"
              style={{ color: 'var(--color-muted)' }}
            >
              No bookings recorded yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <BookingGroup
              title="Upcoming"
              bookings={upcoming}
              emptyHint={null}
            />
            <BookingGroup
              title="Pending requests"
              bookings={pending}
              emptyHint={null}
            />
            <BookingGroup
              title="Past stays"
              bookings={past}
              emptyHint={null}
            />
            <BookingGroup
              title="Cancelled / declined"
              bookings={[...cancelled, ...declined]}
              emptyHint={null}
            />
            {bookings.length === 50 && (
              <p
                className="text-xs fg-mono text-center pt-2"
                style={{ color: 'var(--color-muted)' }}
              >
                Showing the 50 most recent bookings.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function BookingGroup({
  title,
  bookings,
  emptyHint,
}: {
  title: string
  bookings: any[]
  emptyHint: string | null
}) {
  if (bookings.length === 0) return null
  return (
    <div>
      <h3
        className="text-xs fg-mono uppercase tracking-wider mb-2"
        style={{ color: 'var(--color-muted)' }}
      >
        {title}
      </h3>
      <div className="space-y-2">
        {bookings.map((b) => {
          const ci = new Date(b.check_in + 'T00:00:00')
          const co = new Date(b.check_out + 'T00:00:00')
          const nights = Math.round(
            (co.getTime() - ci.getTime()) / 86400000,
          )
          return (
            <div key={b.id} className="fg-card p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--font-serif)',
                      color: 'var(--color-ink)',
                    }}
                  >
                    {ci.toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}{' '}
                    →{' '}
                    {co.toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                  <div
                    className="text-xs fg-mono mt-1"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {nights} night{nights === 1 ? '' : 's'} · {b.adults}{' '}
                    adult{b.adults === 1 ? '' : 's'}
                    {b.children > 0 &&
                      ` · ${b.children} child${b.children === 1 ? '' : 'ren'}`}
                  </div>
                  {b.notes && (
                    <div
                      className="text-xs mt-2 italic"
                      style={{ color: 'var(--color-ink)' }}
                    >
                      &ldquo;{b.notes}&rdquo;
                    </div>
                  )}
                </div>
                <StatusPill status={b.status} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    approved: { label: '✓ Approved', className: 'fg-pill-success' },
    pending: { label: '⏳ Pending', className: 'fg-pill-amber' },
    cancelled: { label: '✕ Cancelled', className: 'fg-pill-muted' },
    declined: { label: '✕ Declined', className: 'fg-pill-muted' },
  }
  const m = map[status] ?? { label: status, className: 'fg-pill-muted' }
  return <span className={`fg-pill ${m.className} text-xs`}>{m.label}</span>
}

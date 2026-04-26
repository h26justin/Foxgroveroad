import Link from 'next/link'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDateRange, relativeFromToday, todayISO } from '@/lib/dates'

export default async function DashboardPage() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const isAdmin = profile.role === 'admin'

  // Pending requests count (admin only)
  let pendingCount = 0
  if (isAdmin) {
    const { count } = await supabase
      .from('booking_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    pendingCount = count ?? 0
  }

  // My upcoming requests (anyone)
  const { data: upcoming } = await supabase
    .from('booking_requests')
    .select('id, check_in, check_out, adults, children, status, notes')
    .eq('requested_by', profile.id)
    .gte('check_out', todayISO())
    .in('status', ['pending', 'approved'])
    .order('check_in', { ascending: true })
    .limit(5)

  return (
    <div>
      <h1
        className="text-3xl mb-2"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
      >
        Welcome back, {profile.full_name.split(' ')[0]}
      </h1>
      <p
        className="text-sm mb-8 fg-mono"
        style={{ color: 'var(--color-muted)' }}
      >
        {new Date().toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>

      {/* Admin: pending requests alert */}
      {isAdmin && pendingCount > 0 && (
        <Link
          href="/admin/bookings"
          className="fg-card-elevated block mb-6 p-5 hover:shadow-md transition-shadow"
          style={{
            borderLeft: '4px solid var(--color-gold)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div
                className="text-sm fg-mono mb-1"
                style={{ color: 'var(--color-gold)' }}
              >
                Action needed
              </div>
              <div
                className="text-lg"
                style={{
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--color-ink)',
                }}
              >
                {pendingCount} booking request{pendingCount === 1 ? '' : 's'}{' '}
                awaiting your review
              </div>
            </div>
            <span style={{ color: 'var(--color-gold)' }}>→</span>
          </div>
        </Link>
      )}

      {/* My upcoming stays */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
          >
            Your upcoming stays
          </h2>
          <Link href="/bookings/new" className="fg-btn-primary text-sm">
            + Request a stay
          </Link>
        </div>

        {!upcoming || upcoming.length === 0 ? (
          <div
            className="fg-card p-6 text-center"
            style={{ color: 'var(--color-muted)' }}
          >
            <p className="text-sm mb-3">No upcoming stays.</p>
            <Link href="/bookings/new" className="fg-btn-gold text-sm">
              Request your first stay
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((req) => (
              <div key={req.id} className="fg-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div
                      className="text-base mb-1"
                      style={{
                        fontFamily: 'var(--font-serif)',
                        color: 'var(--color-ink)',
                      }}
                    >
                      {formatDateRange(req.check_in, req.check_out)}
                    </div>
                    <div
                      className="text-xs fg-mono"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {req.adults} adult{req.adults === 1 ? '' : 's'}
                      {req.children > 0 &&
                        `, ${req.children} child${req.children === 1 ? '' : 'ren'}`}
                      {' · '}check-in {relativeFromToday(req.check_in)}
                    </div>
                    {req.notes && (
                      <p
                        className="text-sm mt-2"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        “{req.notes}”
                      </p>
                    )}
                  </div>
                  <StatusPill status={req.status} />
                </div>
              </div>
            ))}
            <div className="pt-2">
              <Link
                href="/bookings"
                className="text-sm fg-mono"
                style={{ color: 'var(--color-blue)' }}
              >
                View all your bookings →
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'fg-pill fg-pill-amber',
    approved: 'fg-pill fg-pill-green',
    declined: 'fg-pill fg-pill-red',
    cancelled: 'fg-pill fg-pill-muted',
  }
  const label: Record<string, string> = {
    pending: 'Pending review',
    approved: 'Approved',
    declined: 'Declined',
    cancelled: 'Cancelled',
  }
  return <span className={map[status] ?? 'fg-pill'}>{label[status] ?? status}</span>
}

import Link from 'next/link'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDateRange, relativeFromToday, todayISO } from '@/lib/dates'

export default async function DashboardPage() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const isAdmin = profile.role === 'admin'
  const today = todayISO()

  // Admin counters
  let pendingCount = 0
  let needsAssignmentCount = 0
  let occupiedCount = 0

  if (isAdmin) {
    const { count: pc } = await supabase
      .from('booking_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    pendingCount = pc ?? 0

    // Approved requests with no bookings yet
    const { data: approved } = await supabase
      .from('booking_requests')
      .select('id')
      .eq('status', 'approved')
      .gte('check_out', today)

    const { data: bookings } = await supabase
      .from('bookings')
      .select('request_id')
      .eq('status', 'approved')
      .gte('check_out', today)

    const assigned = new Set(
      (bookings ?? []).map((b) => b.request_id).filter(Boolean) as string[]
    )
    needsAssignmentCount = (approved ?? []).filter(
      (r) => !assigned.has(r.id)
    ).length

    // Currently occupied beds
    const { count: oc } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .lte('check_in', today)
      .gt('check_out', today)
    occupiedCount = oc ?? 0
  }

  // My upcoming requests
  const { data: upcoming } = await supabase
    .from('booking_requests')
    .select('id, check_in, check_out, adults, children, status, notes')
    .eq('requested_by', profile.id)
    .gte('check_out', today)
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

      {/* Admin quick stats */}
      {isAdmin && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard
            label="Pending review"
            value={pendingCount}
            color="amber"
            href="/admin/bookings"
            cta={pendingCount > 0 ? 'Review →' : undefined}
          />
          <StatCard
            label="Need bed assignment"
            value={needsAssignmentCount}
            color="gold"
            href="/admin/bookings"
            cta={needsAssignmentCount > 0 ? 'Assign →' : undefined}
          />
          <StatCard
            label="Beds occupied today"
            value={occupiedCount}
            color="green"
            href="/house"
            cta="See house →"
          />
        </div>
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
                      {' · check-in '}
                      {relativeFromToday(req.check_in)}
                    </div>
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

function StatCard({
  label,
  value,
  color,
  href,
  cta,
}: {
  label: string
  value: number
  color: 'amber' | 'gold' | 'green'
  href: string
  cta?: string
}) {
  const colorVar =
    color === 'amber'
      ? 'var(--color-amber)'
      : color === 'gold'
        ? 'var(--color-gold)'
        : 'var(--color-green)'

  return (
    <Link
      href={href}
      className="fg-card p-5 hover:shadow-md transition-shadow"
      style={{ borderLeft: `4px solid ${colorVar}` }}
    >
      <div
        className="text-3xl"
        style={{
          fontFamily: 'var(--font-serif)',
          color: 'var(--color-ink)',
        }}
      >
        {value}
      </div>
      <div
        className="text-xs fg-mono uppercase mt-1"
        style={{ color: 'var(--color-muted)' }}
      >
        {label}
      </div>
      {cta && (
        <div
          className="text-sm fg-mono mt-2"
          style={{ color: colorVar, fontWeight: 500 }}
        >
          {cta}
        </div>
      )}
    </Link>
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

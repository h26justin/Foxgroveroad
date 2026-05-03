import Link from 'next/link'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDateRange, relativeFromToday, todayISO } from '@/lib/dates'
import CancelBookingButton from './CancelBookingButton'

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; cancelled?: string }>
}) {
  const [profile, supabase, sp] = await Promise.all([
    requireProfile(),
    createClient(),
    searchParams,
  ])
  const { success, cancelled } = sp

  // All my requests, newest first by check-in date
  const { data: requests } = await supabase
    .from('booking_requests')
    .select('id, check_in, check_out, adults, children, status, notes, created_at')
    .eq('requested_by', profile.id)
    .order('check_in', { ascending: false })

  const today = todayISO()
  const upcoming = (requests ?? []).filter(
    (r) => r.check_out >= today && r.status !== 'cancelled' && r.status !== 'declined'
  )
  const past = (requests ?? []).filter(
    (r) => r.check_out < today || r.status === 'cancelled' || r.status === 'declined'
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-3xl mb-1"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            Your bookings
          </h1>
          <p
            className="text-sm fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            Request a stay; we'll let you know once approved.
          </p>
        </div>
        <Link
          href="/bookings/new"
          className="fg-btn-primary"
          style={{ width: 'auto', padding: '8px 18px', fontSize: 14 }}
        >
          + Request a stay
        </Link>
      </div>

      {success && (
        <div className="fg-msg-success mb-6">
          Request submitted. You'll get an update once it's reviewed.
        </div>
      )}
      {cancelled && (
        <div className="fg-msg-success mb-6">Request cancelled.</div>
      )}

      {(!requests || requests.length === 0) && (
        <div
          className="fg-card p-10 text-center"
          style={{ color: 'var(--color-muted)' }}
        >
          <p className="mb-4">You haven't booked any stays yet.</p>
          <Link href="/bookings/new" className="fg-btn-gold">
            Request your first stay
          </Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mb-10">
          <h2 className="fg-section-label mb-3">Upcoming &amp; pending</h2>
          <div className="space-y-3">
            {upcoming.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                canCancel={r.status === 'pending' || r.status === 'approved'}
              />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="fg-section-label mb-3">Past &amp; archived</h2>
          <div className="space-y-3">
            {past.map((r) => (
              <RequestCard key={r.id} request={r} canCancel={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function RequestCard({
  request,
  canCancel,
}: {
  request: {
    id: string
    check_in: string
    check_out: string
    adults: number
    children: number
    status: string
    notes: string | null
  }
  canCancel: boolean
}) {
  return (
    <div className="fg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div
            className="text-base mb-1"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            {formatDateRange(request.check_in, request.check_out)}
          </div>
          <div
            className="text-xs fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            {request.adults} adult{request.adults === 1 ? '' : 's'}
            {request.children > 0 &&
              `, ${request.children} child${request.children === 1 ? '' : 'ren'}`}
            {request.status === 'pending' &&
              ` · check-in ${relativeFromToday(request.check_in)}`}
          </div>
          {request.notes && (
            <p
              className="text-sm mt-2"
              style={{ color: 'var(--color-muted)' }}
            >
              “{request.notes}”
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <StatusPill status={request.status} />
          {canCancel && (
            <CancelBookingButton
              requestId={request.id}
              isApproved={request.status === 'approved'}
            />
          )}
        </div>
      </div>
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

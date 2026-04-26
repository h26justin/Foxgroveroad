import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDateRange, relativeFromToday, todayISO } from '@/lib/dates'
import { approveRequest, declineRequest } from './actions'

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ approved?: string; declined?: string }>
}) {
  await requireAdmin()
  const { approved, declined } = await searchParams
  const supabase = await createClient()

  // Pending requests with the requester's name attached
  const { data: pending } = await supabase
    .from('booking_requests')
    .select(
      'id, check_in, check_out, adults, children, notes, status, created_at, requested_by, profiles:profiles!booking_requests_requested_by_fkey(full_name)'
    )
    .eq('status', 'pending')
    .order('check_in', { ascending: true })

  // Recently decided (last 10) — for context
  const { data: recent } = await supabase
    .from('booking_requests')
    .select(
      'id, check_in, check_out, adults, children, notes, status, decided_at, admin_notes, profiles:profiles!booking_requests_requested_by_fkey(full_name)'
    )
    .in('status', ['approved', 'declined'])
    .order('decided_at', { ascending: false })
    .limit(10)

  return (
    <div>
      <div className="mb-8">
        <h1
          className="text-3xl mb-2"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          Booking requests
        </h1>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          Approve or decline family stay requests. Bed assignment happens after
          approval (coming soon).
        </p>
      </div>

      {approved && (
        <div className="fg-msg-success mb-6">Request approved.</div>
      )}
      {declined && <div className="fg-msg-success mb-6">Request declined.</div>}

      {/* Pending */}
      <section className="mb-12">
        <h2 className="fg-section-label mb-3">
          Awaiting review {pending && pending.length > 0 && `(${pending.length})`}
        </h2>

        {!pending || pending.length === 0 ? (
          <div
            className="fg-card p-8 text-center"
            style={{ color: 'var(--color-muted)' }}
          >
            <p className="text-sm">No pending requests right now. ☕</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((req) => (
              <PendingCard key={req.id} req={req} />
            ))}
          </div>
        )}
      </section>

      {/* Recent decisions */}
      {recent && recent.length > 0 && (
        <section>
          <h2 className="fg-section-label mb-3">Recently decided</h2>
          <div className="space-y-2">
            {recent.map((req) => (
              <DecidedRow key={req.id} req={req} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function PendingCard({ req }: { req: any }) {
  const requesterName =
    req.profiles?.full_name ?? 'Unknown family member'
  const isPast = req.check_out < todayISO()

  return (
    <div className="fg-card-elevated p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-base"
              style={{
                fontFamily: 'var(--font-serif)',
                color: 'var(--color-ink)',
              }}
            >
              {requesterName}
            </span>
            {isPast && (
              <span className="fg-pill fg-pill-muted text-xs">past dates</span>
            )}
          </div>
          <div
            className="text-sm mb-1"
            style={{ color: 'var(--color-ink)' }}
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
          {req.notes && (
            <p
              className="text-sm mt-3 px-3 py-2 rounded-md"
              style={{
                background: 'var(--color-cream)',
                color: 'var(--color-ink)',
              }}
            >
              {req.notes}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-3 border-t" style={{ borderColor: 'var(--color-warm)' }}>
        <form action={approveRequest}>
          <input type="hidden" name="id" value={req.id} />
          <button type="submit" className="fg-btn-primary text-sm">
            Approve
          </button>
        </form>

        <form action={declineRequest} className="flex items-center gap-2 flex-1">
          <input type="hidden" name="id" value={req.id} />
          <input
            type="text"
            name="reason"
            placeholder="Reason (optional, sent to family)"
            className="fg-input text-sm flex-1"
            style={{ padding: '6px 10px' }}
            maxLength={200}
          />
          <button
            type="submit"
            className="fg-btn-ghost text-sm"
            style={{ color: 'var(--color-red)' }}
          >
            Decline
          </button>
        </form>
      </div>
    </div>
  )
}

function DecidedRow({ req }: { req: any }) {
  const name = req.profiles?.full_name ?? 'Unknown'
  return (
    <div
      className="fg-card px-4 py-3 flex items-center justify-between gap-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span
            className="text-sm"
            style={{ color: 'var(--color-ink)' }}
          >
            {name}
          </span>
          <span
            className="text-xs fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            {formatDateRange(req.check_in, req.check_out)}
          </span>
        </div>
        {req.admin_notes && (
          <p
            className="text-xs mt-1"
            style={{ color: 'var(--color-muted)' }}
          >
            “{req.admin_notes}”
          </p>
        )}
      </div>
      <StatusPill status={req.status} />
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
  return <span className={map[status] ?? 'fg-pill'}>{status}</span>
}

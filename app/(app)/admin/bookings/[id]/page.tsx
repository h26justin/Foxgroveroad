import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  formatDateRange,
  nightsBetween,
  relativeFromToday,
} from '@/lib/dates'
import { cancelBooking } from './actions'

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const [, p, sp, supabase] = await Promise.all([
    requireAdmin(),
    params,
    searchParams,
    createClient(),
  ])
  const { id } = p
  const { error, success } = sp

  const { data: booking } = await supabase
    .from('bookings')
    .select(
      `
      id, check_in, check_out, status, guest_name, request_id, created_at, notes,
      beds:beds!bookings_bed_id_fkey(
        id, name, bed_type,
        rooms:rooms(id, name, floor, is_owner_room)
      ),
      profiles:profiles!bookings_requested_by_fkey(id, full_name)
    `
    )
    .eq('id', id)
    .maybeSingle()

  if (!booking) notFound()

  const bed: any = booking.beds
  const room: any = bed?.rooms
  const requester: any = booking.profiles

  // Sibling beds in the same booking_request (so admin sees the full party)
  let siblings: any[] = []
  if (booking.request_id) {
    const { data: sibs } = await supabase
      .from('bookings')
      .select(
        'id, status, beds:beds!bookings_bed_id_fkey(name, rooms:rooms(name))'
      )
      .eq('request_id', booking.request_id)
      .neq('id', booking.id)
      .order('created_at')
    siblings = sibs ?? []
  }

  const isCancellable = booking.status === 'approved'
  const checkOutPassed = new Date(booking.check_out + 'T00:00:00') <= new Date()

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/bookings"
        className="text-sm fg-mono inline-block mb-2"
        style={{ color: 'var(--color-muted)' }}
      >
        ← Back to calendar
      </Link>
      <h1
        className="text-3xl mb-6"
        style={{
          fontFamily: 'var(--font-serif)',
          color: 'var(--color-ink)',
        }}
      >
        Booking detail
      </h1>

      {error && <div className="fg-msg-error mb-6">{error}</div>}
      {success && <div className="fg-msg-success mb-6">{success}</div>}

      {/* Status banner */}
      <div className="mb-6">
        <StatusPill status={booking.status} />
        {checkOutPassed && booking.status === 'approved' && (
          <span className="fg-pill fg-pill-muted ml-2">past stay</span>
        )}
      </div>

      {/* Card: who & when */}
      <div className="fg-card-elevated p-6 mb-4">
        <div
          className="text-2xl mb-1"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          {requester?.full_name ?? booking.guest_name}
        </div>
        <div className="fg-mono text-sm" style={{ color: 'var(--color-muted)' }}>
          {formatDateRange(booking.check_in, booking.check_out)} ·{' '}
          {nightsBetween(booking.check_in, booking.check_out)} night
          {nightsBetween(booking.check_in, booking.check_out) === 1 ? '' : 's'}
        </div>
        {booking.status === 'approved' && !checkOutPassed && (
          <div
            className="fg-mono text-xs mt-2"
            style={{ color: 'var(--color-gold)' }}
          >
            {relativeFromToday(booking.check_in)}
          </div>
        )}
      </div>

      {/* Card: bed assignment */}
      {bed && room && (
        <div className="fg-card p-5 mb-4">
          <div
            className="fg-section-label mb-3"
            style={{ color: 'var(--color-gold)' }}
          >
            Bed assigned
          </div>
          <div
            className="text-lg"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            {room.name}
          </div>
          <div
            className="fg-mono text-sm mt-1"
            style={{ color: 'var(--color-muted)' }}
          >
            {bed.name} · {bedTypeLabel(bed.bed_type)}
          </div>
        </div>
      )}

      {/* Sibling beds in the same request */}
      {siblings.length > 0 && (
        <div className="fg-card p-5 mb-4">
          <div
            className="fg-section-label mb-3"
            style={{ color: 'var(--color-gold)' }}
          >
            Other beds in this stay
          </div>
          <ul className="space-y-2">
            {siblings.map((s) => {
              const sBed: any = s.beds
              const sRoom: any = sBed?.rooms
              return (
                <li key={s.id} className="flex items-center justify-between">
                  <div>
                    <span
                      className="text-sm"
                      style={{ color: 'var(--color-ink)' }}
                    >
                      {sRoom?.name ?? '—'}
                    </span>
                    <span
                      className="fg-mono text-xs ml-2"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {sBed?.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={s.status} small />
                    <Link
                      href={`/admin/bookings/${s.id}`}
                      className="text-xs fg-mono"
                      style={{ color: 'var(--color-blue)' }}
                    >
                      View
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Notes */}
      {booking.notes && (
        <div className="fg-card p-5 mb-4">
          <div
            className="fg-section-label mb-2"
            style={{ color: 'var(--color-gold)' }}
          >
            Notes
          </div>
          <div className="text-sm" style={{ color: 'var(--color-ink)' }}>
            {booking.notes}
          </div>
        </div>
      )}

      {/* Cancel action */}
      {isCancellable && !checkOutPassed && (
        <form
          action={cancelBooking}
          className="fg-card p-5 mb-4"
          style={{ borderLeft: '4px solid var(--color-red)' }}
        >
          <input type="hidden" name="id" value={booking.id} />
          <div
            className="fg-section-label mb-2"
            style={{ color: 'var(--color-red)' }}
          >
            Cancel this bed
          </div>
          <p
            className="text-sm mb-4"
            style={{ color: 'var(--color-muted)' }}
          >
            This frees up <strong>{room?.name}</strong> for new bookings on
            these dates. The original booking request stays approved
            {siblings.length > 0
              ? ` (${siblings.length} other bed${siblings.length === 1 ? '' : 's'} in this party are unaffected)`
              : ''}
            . You can re-assign later if plans change again.
          </p>
          <div className="grid grid-cols-1 gap-3 mb-4">
            <input
              type="text"
              name="reason"
              placeholder="Reason (optional, for your records)"
              className="fg-input"
              maxLength={200}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="fg-btn-primary"
              style={{
                background: 'var(--color-red)',
                color: 'white',
                borderColor: 'var(--color-red)',
              }}
            >
              Confirm cancellation
            </button>
            <Link href="/admin/bookings" className="fg-btn-ghost">
              Keep it
            </Link>
          </div>
        </form>
      )}

      {booking.status === 'cancelled' && (
        <div className="fg-card p-5 fg-mono text-sm" style={{ color: 'var(--color-muted)' }}>
          This booking was cancelled. The bed is available for re-assignment.
        </div>
      )}
    </div>
  )
}

function StatusPill({
  status,
  small,
}: {
  status: string
  small?: boolean
}) {
  const map: Record<string, { label: string; klass: string }> = {
    approved: { label: 'Approved', klass: 'fg-pill fg-pill-green' },
    cancelled: { label: 'Cancelled', klass: 'fg-pill fg-pill-red' },
    declined: { label: 'Declined', klass: 'fg-pill fg-pill-red' },
    requested: { label: 'Pending', klass: 'fg-pill fg-pill-amber' },
    checked_out: { label: 'Checked out', klass: 'fg-pill fg-pill-muted' },
  }
  const cfg = map[status] ?? { label: status, klass: 'fg-pill fg-pill-muted' }
  return (
    <span
      className={cfg.klass}
      style={small ? { fontSize: 11, padding: '2px 8px' } : undefined}
    >
      {cfg.label}
    </span>
  )
}

function bedTypeLabel(t: string): string {
  switch (t) {
    case 'single':
      return 'Single (UK 3ft)'
    case 'double':
      return 'Double (UK 4’6")'
    case 'king':
      return 'King (UK 5ft)'
    case 'super_king':
      return 'Super King (UK 6ft)'
    case 'cot':
      return 'Cot'
    default:
      return t
  }
}

import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDateRange } from '@/lib/dates'
import BedroomOrganiser from './BedroomOrganiser'

export const revalidate = 0

export default async function BedroomsPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string; saved?: string; error?: string }>
}) {
  // Stage 0 — auth + searchParams + supabase client in parallel
  const [, sp, supabase] = await Promise.all([
    requireAdmin(),
    searchParams,
    createClient(),
  ])
  const today = new Date().toISOString().split('T')[0]

  // Stage 1 — requests + rooms + templates have no dependencies, fire all three.
  const [requestsRes, roomsRes, templatesRes] = await Promise.all([
    supabase
      .from('booking_requests')
      .select(
        'id, check_in, check_out, adults, adults_sharing, children, status, profiles:profiles!booking_requests_requested_by_fkey(full_name), booking_request_children(id, age_band, sleep_arrangement, position)'
      )
      .eq('status', 'approved')
      .gte('check_out', today)
      .order('check_in', { ascending: true }),
    supabase
      .from('rooms')
      .select('id, name, floor, room_type, can_fit_cot, beds(id, name, bed_type)')
      .eq('room_type', 'bedroom')
      .order('floor', { ascending: false })
      .order('name'),
    supabase
      .from('prearrival_templates')
      .select('id, room_id, name, position')
      .order('position'),
  ])

  const requests = (requestsRes.data as any[]) ?? []

  // Pre-format dates server-side; client doesn't need formatDateRange.
  // Also derive cot count up-front so the client can show warnings.
  const requestsWithLabels = requests.map((r) => {
    const childRows: any[] = r.booking_request_children ?? []
    const cotCount = childRows.filter((c) => c.sleep_arrangement === 'cot').length
    return {
      ...r,
      dateLabel: formatDateRange(r.check_in, r.check_out),
      requesterName: (r.profiles as any)?.full_name ?? 'Family guest',
      cotCount,
      adultsSharing: r.adults_sharing !== false, // null/undef defaults to true
    }
  })

  // The currently-selected request. If the URL has a stale request ID
  // (cancelled/past booking that's no longer in the approved-upcoming list),
  // fall back to the next upcoming.
  const validIds = new Set(requests.map((r) => r.id))
  const selectedRequestId =
    sp.request && validIds.has(sp.request)
      ? sp.request
      : (requests[0]?.id ?? null)

  const selectedRequest = requests.find((r) => r.id === selectedRequestId)

  // Stage 2 — bookings/overlapping/checks all depend on selectedRequestId,
  // so we fire them after stage 1 — but the three are independent of each
  // other so they go in parallel.
  const [bookingsRes, overlappingRes, checksRes] = await Promise.all([
    selectedRequestId
      ? supabase
          .from('bookings')
          .select('id, bed_id, guest_name, check_in, check_out, request_id')
          .eq('request_id', selectedRequestId)
          .order('guest_name')
      : Promise.resolve({ data: [] as any[] }),
    selectedRequest
      ? supabase
          .from('bookings')
          .select(
            'id, bed_id, guest_name, check_in, check_out, request_id, profiles:profiles!bookings_requested_by_fkey(full_name)'
          )
          .eq('status', 'approved')
          .lt('check_in', selectedRequest.check_out)
          .gt('check_out', selectedRequest.check_in)
          .neq('request_id', selectedRequestId)
      : Promise.resolve({ data: [] as any[] }),
    selectedRequestId
      ? supabase
          .from('prearrival_checks')
          .select('id, template_id, room_id, checked_at, checked_by')
          .eq('booking_request_id', selectedRequestId)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const roomsRaw = roomsRes.data
  const templatesRaw = templatesRes.data
  const bookingsRaw = bookingsRes.data
  const overlappingRaw = overlappingRes.data
  const checksRaw = checksRes.data

  return (
    <div>
      {/* ─── Header ─── */}
      <div className="mb-6">
        <h1
          className="text-3xl md:text-4xl mb-2"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          Bedrooms
        </h1>
        <p
          className="text-sm fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          Drag guest pills onto beds. Tap a pill to rename, or use the × to
          remove.
        </p>
        <Link
          href="/admin/prearrival-templates"
          className="fg-btn-ghost text-xs mt-3 inline-block"
          style={{ width: 'auto' }}
        >
          Manage checklist templates →
        </Link>
      </div>

      {/* ─── Empty state ─── */}
      {requests.length === 0 && (
        <div className="fg-card p-8 text-center">
          <p
            className="text-sm"
            style={{ color: 'var(--color-muted)' }}
          >
            No upcoming approved bookings to organise. Approve a booking
            request first in{' '}
            <Link
              href="/admin/bookings"
              className="underline"
              style={{ color: 'var(--color-slate)' }}
            >
              Bookings
            </Link>
            .
          </p>
        </div>
      )}

      {/* ─── Request picker + organiser ─── */}
      {requests.length > 0 && (
        <BedroomOrganiser
          requests={requestsWithLabels}
          selectedRequestId={selectedRequestId}
          rooms={(roomsRaw as any[]) ?? []}
          bookings={(bookingsRaw as any[]) ?? []}
          overlappingBookings={(overlappingRaw as any[]) ?? []}
          templates={(templatesRaw as any[]) ?? []}
          checks={(checksRaw as any[]) ?? []}
          savedMessage={sp.saved ?? null}
          errorMessage={sp.error ?? null}
        />
      )}
    </div>
  )
}

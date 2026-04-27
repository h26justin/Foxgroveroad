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
  await requireAdmin()
  const sp = await searchParams
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // Approved upcoming requests — these are the ones admin can organise.
  const { data: requestsRaw } = await supabase
    .from('booking_requests')
    .select(
      'id, check_in, check_out, adults, children, status, profiles:profiles!booking_requests_requested_by_fkey(full_name)'
    )
    .eq('status', 'approved')
    .gte('check_out', today)
    .order('check_in', { ascending: true })

  const requests = (requestsRaw as any[]) ?? []

  // Pre-format dates server-side; client doesn't need formatDateRange.
  const requestsWithLabels = requests.map((r) => ({
    ...r,
    dateLabel: formatDateRange(r.check_in, r.check_out),
    requesterName: (r.profiles as any)?.full_name ?? 'Family guest',
  }))

  // The currently-selected request. If the URL has a stale request ID
  // (cancelled/past booking that's no longer in the approved-upcoming list),
  // fall back to the next upcoming.
  const validIds = new Set(requests.map((r) => r.id))
  const selectedRequestId =
    sp.request && validIds.has(sp.request)
      ? sp.request
      : (requests[0]?.id ?? null)

  // All bedrooms + their beds — for the visual grid. Other room types
  // (bathrooms, landings, storage) don't belong in the organiser.
  const { data: roomsRaw } = await supabase
    .from('rooms')
    .select('id, name, floor, room_type, beds(id, name, bed_type)')
    .eq('room_type', 'bedroom')
    .order('floor', { ascending: false })
    .order('name')

  // Booking rows for the selected request — these are our draggable pills
  const { data: bookingsRaw } = selectedRequestId
    ? await supabase
        .from('bookings')
        .select('id, bed_id, guest_name, check_in, check_out, request_id')
        .eq('request_id', selectedRequestId)
        .order('guest_name')
    : { data: [] }

  // Pre-arrival checklist templates per room
  const { data: templatesRaw } = await supabase
    .from('prearrival_templates')
    .select('id, room_id, name, position')
    .order('position')

  // Existing checks for this booking
  const { data: checksRaw } = selectedRequestId
    ? await supabase
        .from('prearrival_checks')
        .select('id, template_id, room_id, checked_at, checked_by')
        .eq('booking_request_id', selectedRequestId)
    : { data: [] }

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
          templates={(templatesRaw as any[]) ?? []}
          checks={(checksRaw as any[]) ?? []}
          savedMessage={sp.saved ?? null}
          errorMessage={sp.error ?? null}
        />
      )}
    </div>
  )
}

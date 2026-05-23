import Link from 'next/link'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDateRange, relativeFromToday, todayISO } from '@/lib/dates'
import CancelBookingButton from './CancelBookingButton'
import ArrivalLinkButton from './ArrivalLinkButton'

// 30s soft cache — mutations call revalidatePath('/bookings') so the
// owner of the change sees it immediately.
export const revalidate = 30

type RequestRow = {
  id: string
  check_in: string
  check_out: string
  adults: number
  children: number
  status: string
  notes: string | null
  arrival_token: string | null
}

type GuestEntry = { full_name: string; position: number }
type BedAssignment = { room_name: string; bed_label: string; guest_name: string | null }

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
  const isAdmin = profile.role === 'admin'

  // All my requests, newest first by check-in date
  const { data: requestsRaw } = await supabase
    .from('booking_requests')
    .select(
      'id, check_in, check_out, adults, children, status, notes, created_at, arrival_token',
    )
    .eq('requested_by', profile.id)
    .order('check_in', { ascending: false })

  const requests = (requestsRaw as RequestRow[] | null) ?? []
  const requestIds = requests.map((r) => r.id)

  // Pull guest lists + bed assignments in parallel for ALL visible requests.
  // Cheap join queries; size is bounded by the user's own bookings.
  const [brgRes, bedsRes] = await Promise.all([
    requestIds.length > 0
      ? supabase
          .from('booking_request_guests')
          .select(
            'request_id, position, guests:guests!booking_request_guests_guest_id_fkey(full_name)',
          )
          .in('request_id', requestIds)
          .order('position')
      : Promise.resolve({ data: [] as any[] }),
    requestIds.length > 0
      ? supabase
          .from('bookings')
          .select(
            'request_id, guest_name, bed_id, beds:beds!bookings_bed_id_fkey(name, rooms:rooms!beds_room_id_fkey(name))',
          )
          .in('request_id', requestIds)
          .eq('status', 'approved')
      : Promise.resolve({ data: [] as any[] }),
  ])

  // Build per-request guest list
  const guestsByRequest = new Map<string, GuestEntry[]>()
  for (const r of (brgRes.data as any[]) ?? []) {
    if (!r.guests) continue
    const list = guestsByRequest.get(r.request_id) ?? []
    list.push({
      full_name: (r.guests as any).full_name ?? '(deleted guest)',
      position: r.position ?? 0,
    })
    guestsByRequest.set(r.request_id, list)
  }
  for (const arr of guestsByRequest.values()) {
    arr.sort((a, b) => a.position - b.position)
  }

  // Build per-request bed assignment list
  const bedsByRequest = new Map<string, BedAssignment[]>()
  for (const b of (bedsRes.data as any[]) ?? []) {
    const list = bedsByRequest.get(b.request_id) ?? []
    list.push({
      room_name: (b.beds as any)?.rooms?.name ?? '(deleted room)',
      bed_label: (b.beds as any)?.name ?? '?',
      guest_name: b.guest_name ?? null,
    })
    bedsByRequest.set(b.request_id, list)
  }

  const today = todayISO()
  const upcoming = requests.filter(
    (r) =>
      r.check_out >= today && r.status !== 'cancelled' && r.status !== 'declined',
  )
  const past = requests.filter(
    (r) =>
      r.check_out < today || r.status === 'cancelled' || r.status === 'declined',
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
            {isAdmin
              ? 'Bookings you created. Tap "Open in panel" to manage guests and beds.'
              : "Request a stay; we'll let you know once approved."}
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
          Request submitted. You&apos;ll get an update once it&apos;s reviewed.
        </div>
      )}
      {cancelled && (
        <div className="fg-msg-success mb-6">Request cancelled.</div>
      )}

      {requests.length === 0 && (
        <div
          className="fg-card p-10 text-center"
          style={{ color: 'var(--color-muted)' }}
        >
          <p className="mb-4">You haven&apos;t booked any stays yet.</p>
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
                guests={guestsByRequest.get(r.id) ?? []}
                beds={bedsByRequest.get(r.id) ?? []}
                isAdmin={isAdmin}
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
              <RequestCard
                key={r.id}
                request={r}
                guests={guestsByRequest.get(r.id) ?? []}
                beds={bedsByRequest.get(r.id) ?? []}
                isAdmin={isAdmin}
                canCancel={false}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function RequestCard({
  request,
  guests,
  beds,
  isAdmin,
  canCancel,
}: {
  request: RequestRow
  guests: GuestEntry[]
  beds: BedAssignment[]
  isAdmin: boolean
  canCancel: boolean
}) {
  // Group beds by room for cleaner display
  const byRoom = new Map<string, BedAssignment[]>()
  for (const b of beds) {
    const list = byRoom.get(b.room_name) ?? []
    list.push(b)
    byRoom.set(b.room_name, list)
  }

  // Admins can open the booking in the /house panel by clicking anywhere
  // on the card — uses the stretched-link pattern so interactive
  // children (Cancel button, Share arrival link) still work. Only
  // applied to non-terminal bookings to avoid letting admin navigate
  // into a panel for a cancelled stay.
  const cardIsClickable =
    isAdmin &&
    request.status !== 'cancelled' &&
    request.status !== 'declined'

  return (
    <div className="fg-card p-5" style={{ position: 'relative' }}>
      {cardIsClickable && (
        <Link
          href={`/house?request=${request.id}`}
          aria-label="Open booking in panel"
          className="fg-stretched-link"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            // Keep it invisible but focusable + announceable
            color: 'transparent',
            overflow: 'hidden',
            textIndent: '-9999px',
          }}
        >
          Open
        </Link>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1" style={{ minWidth: 240 }}>
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
            className="text-xs fg-mono mb-2"
            style={{ color: 'var(--color-muted)' }}
          >
            {request.adults} adult{request.adults === 1 ? '' : 's'}
            {request.children > 0 &&
              `, ${request.children} child${request.children === 1 ? '' : 'ren'}`}
            {request.status === 'pending' &&
              ` · check-in ${relativeFromToday(request.check_in)}`}
          </div>

          {/* Guest list */}
          {guests.length > 0 && (
            <div className="mt-2">
              <div
                className="text-[10px] fg-mono uppercase tracking-wide mb-1"
                style={{ color: 'var(--color-muted)' }}
              >
                Guests
              </div>
              <div
                className="text-sm"
                style={{ color: 'var(--color-ink)' }}
              >
                {guests.map((g) => g.full_name).join(', ')}
              </div>
            </div>
          )}

          {/* Bed assignments — only show for approved */}
          {request.status === 'approved' && byRoom.size > 0 && (
            <div className="mt-3">
              <div
                className="text-[10px] fg-mono uppercase tracking-wide mb-1"
                style={{ color: 'var(--color-muted)' }}
              >
                Rooms
              </div>
              <div className="space-y-1">
                {Array.from(byRoom.entries()).map(([roomName, bedsInRoom]) => (
                  <div
                    key={roomName}
                    className="text-sm"
                    style={{ color: 'var(--color-ink)' }}
                  >
                    🛏 {roomName}{' '}
                    <span
                      className="text-xs fg-mono"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      ·{' '}
                      {bedsInRoom
                        .map((b) => b.guest_name ?? 'Unassigned')
                        .join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Approved but no beds yet */}
          {request.status === 'approved' && byRoom.size === 0 && (
            <div
              className="text-xs fg-mono mt-2"
              style={{ color: 'var(--color-amber)' }}
            >
              ⚠ No beds assigned yet
              {isAdmin && ' — open in panel to assign'}
            </div>
          )}

          {request.notes && (
            <p
              className="text-sm mt-3 italic"
              style={{ color: 'var(--color-muted)' }}
            >
              &ldquo;{request.notes}&rdquo;
            </p>
          )}
        </div>

        {/* Right side: status + actions. zIndex pulls interactive
            controls above the stretched card link so they capture
            clicks first. */}
        <div
          className="flex flex-col items-end gap-2 shrink-0"
          style={{ position: 'relative', zIndex: 2 }}
        >
          <StatusPill status={request.status} />

          {/* Open-in-panel chevron — still rendered as a visible
              affordance for admin, even though the whole card is now
              clickable. Keeps discoverability while not stealing the
              click from the card. */}
          {cardIsClickable && (
            <span
              aria-hidden
              className="fg-btn-ghost text-xs"
              style={{
                width: 'auto',
                padding: '6px 12px',
                opacity: 0.8,
                pointerEvents: 'none',
              }}
            >
              Open in panel →
            </span>
          )}

          {/* Arrival packet link — only on approved bookings that have
              a token (backfilled by 07_arrival_packet.sql for existing
              approvals). */}
          {request.status === 'approved' && request.arrival_token && (
            <ArrivalLinkButton token={request.arrival_token} />
          )}

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
  return (
    <span className={map[status] ?? 'fg-pill'}>{label[status] ?? status}</span>
  )
}

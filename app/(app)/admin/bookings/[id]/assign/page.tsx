import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDateRange } from '@/lib/dates'
import { assignBeds, unassignBeds } from './actions'

export default async function AssignBedsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const { saved, error } = await searchParams
  const supabase = await createClient()

  // Get the request with the requester
  const { data: request } = await supabase
    .from('booking_requests')
    .select(
      'id, check_in, check_out, adults, children, notes, status, profiles:profiles!booking_requests_requested_by_fkey(full_name)'
    )
    .eq('id', id)
    .single()

  if (!request) notFound()

  // Get all rooms + beds
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, floor, is_owner_room')
    .order('floor', { ascending: false })
    .order('name')

  const { data: beds } = await supabase
    .from('beds')
    .select('id, room_id, name, bed_type')
    .order('name')

  // Find conflicts: bookings on these dates that overlap
  const { data: conflictingBookings } = await supabase
    .from('bookings')
    .select(
      'id, bed_id, check_in, check_out, request_id, guest_name, profiles:profiles!bookings_requested_by_fkey(full_name)'
    )
    .eq('status', 'approved')
    .lt('check_in', request.check_out)
    .gt('check_out', request.check_in)

  const conflicts = new Map<string, any>()
  for (const b of conflictingBookings ?? []) {
    if (!b.bed_id) continue
    if (!conflicts.has(b.bed_id)) conflicts.set(b.bed_id, b)
  }

  // Beds already assigned to THIS request
  const alreadyAssigned = (conflictingBookings ?? [])
    .filter((b) => b.request_id === id)
    .map((b) => b.bed_id)
    .filter(Boolean) as string[]

  const requesterName =
    (request.profiles as any)?.full_name ?? 'Unknown'
  const totalGuests = request.adults + request.children

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/bookings"
          className="text-sm fg-mono inline-block mb-2"
          style={{ color: 'var(--color-muted)' }}
        >
          ← Back to calendar
        </Link>
        <h1
          className="text-3xl mb-2"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          Assign beds
        </h1>
      </div>

      {/* Request summary */}
      <div className="fg-card-elevated p-5 mb-6">
        <div
          className="text-lg mb-1"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          {requesterName}
        </div>
        <div className="text-sm" style={{ color: 'var(--color-ink)' }}>
          {formatDateRange(request.check_in, request.check_out)}
        </div>
        <div
          className="text-xs fg-mono mt-1"
          style={{ color: 'var(--color-muted)' }}
        >
          {totalGuests} guest{totalGuests === 1 ? '' : 's'} ·{' '}
          {request.adults} adult{request.adults === 1 ? '' : 's'}
          {request.children > 0 &&
            `, ${request.children} child${request.children === 1 ? '' : 'ren'}`}
        </div>
        {request.notes && (
          <p
            className="text-sm mt-3 px-3 py-2 rounded"
            style={{
              background: 'var(--color-cream)',
              color: 'var(--color-ink)',
            }}
          >
            {request.notes}
          </p>
        )}
      </div>

      {saved && <div className="fg-msg-success mb-6">{saved}</div>}
      {error && <div className="fg-msg-error mb-6">{error}</div>}

      {/* Bed selection form */}
      <form action={assignBeds}>
        <input type="hidden" name="request_id" value={id} />

        <h2 className="fg-section-label mb-3">Select beds</h2>

        <div className="space-y-4 mb-6">
          {(rooms ?? []).map((room) => {
            const roomBeds = (beds ?? []).filter((b) => b.room_id === room.id)
            return (
              <div key={room.id} className="fg-card p-5">
                <div className="mb-3">
                  <h3
                    className="text-base"
                    style={{
                      fontFamily: 'var(--font-serif)',
                      color: 'var(--color-ink)',
                    }}
                  >
                    {room.name}
                    {room.is_owner_room && (
                      <span className="fg-pill fg-pill-gold ml-2 text-xs">
                        owner only
                      </span>
                    )}
                  </h3>
                </div>

                <div className="space-y-2">
                  {roomBeds.map((bed) => {
                    const conflict = conflicts.get(bed.id)
                    const conflictIsThisRequest = conflict?.request_id === id
                    const isBlocked = conflict && !conflictIsThisRequest
                    const isCheckedByDefault = alreadyAssigned.includes(bed.id)

                    return (
                      <label
                        key={bed.id}
                        className="flex items-start gap-3 py-2 px-3 rounded cursor-pointer"
                        style={{
                          background: isBlocked
                            ? 'rgba(204, 51, 51, 0.05)'
                            : 'var(--color-cream)',
                          opacity: isBlocked || room.is_owner_room ? 0.6 : 1,
                          cursor:
                            isBlocked || room.is_owner_room
                              ? 'not-allowed'
                              : 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          name="bed_ids"
                          value={bed.id}
                          defaultChecked={isCheckedByDefault}
                          disabled={!!(isBlocked || room.is_owner_room)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-sm"
                            style={{ color: 'var(--color-ink)' }}
                          >
                            {bed.name}{' '}
                            <span
                              className="fg-mono text-xs"
                              style={{ color: 'var(--color-muted)' }}
                            >
                              · {bed.bed_type.replace('_', ' ')}
                            </span>
                          </div>
                          {isBlocked && (
                            <div
                              className="text-xs fg-mono mt-1"
                              style={{ color: 'var(--color-red)' }}
                            >
                              taken by{' '}
                              {(conflict.profiles as any)?.full_name ??
                                conflict.guest_name}{' '}
                              ({formatDateRange(
                                conflict.check_in,
                                conflict.check_out
                              )})
                            </div>
                          )}
                          {room.is_owner_room && !isBlocked && (
                            <div
                              className="text-xs fg-mono mt-1"
                              style={{ color: 'var(--color-muted)' }}
                            >
                              reserved for owners — not bookable by family
                            </div>
                          )}
                          {conflictIsThisRequest && (
                            <div
                              className="text-xs fg-mono mt-1"
                              style={{ color: 'var(--color-green)' }}
                            >
                              already assigned to this booking
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="fg-btn-primary">
            Save assignment
          </button>
          {alreadyAssigned.length > 0 && (
            <button
              type="submit"
              formAction={unassignBeds}
              className="fg-btn-ghost"
              style={{ color: 'var(--color-red)' }}
            >
              Clear all assignments
            </button>
          )}
          <Link href="/admin/bookings" className="fg-btn-ghost">
            Cancel
          </Link>
        </div>

        <p
          className="text-xs fg-mono mt-4"
          style={{ color: 'var(--color-muted)' }}
        >
          Tip: you can come back and change this any time. Bookings that
          conflict with other approved stays are blocked automatically.
        </p>
      </form>
    </div>
  )
}

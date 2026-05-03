'use server'

/**
 * Action layer for the unified House page.
 *
 * Next.js 16 enforces that a 'use server' file may only export async
 * functions DIRECTLY — `export { foo } from '...'` re-exports are
 * rejected at build time. So we import the upstream functions and wrap
 * each one with a local async function that calls through.
 *
 * The heavy lifting (approve/decline, calendar move, bed pill move,
 * conflict pre-checks, friendly errors) lives in /admin/bookings and
 * /bedrooms action files — we just provide House-page entry points here.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

import {
  approveRequest as approveRequestImpl,
  declineRequest as declineRequestImpl,
  moveBookingToRoomAndDates as moveBookingToRoomAndDatesImpl,
} from '../admin/bookings/actions'

import {
  movePillToBed as movePillToBedImpl,
  addGuestToFirstAvailableBed as addGuestToFirstAvailableBedImpl,
  renameGuest as renameGuestImpl,
  removeGuest as removeGuestImpl,
  togglePrearrivalCheck as togglePrearrivalCheckImpl,
} from '../bedrooms/actions'

// ─── /admin/bookings/actions wrappers ────────────────────────────────

export async function approveRequest(formData: FormData) {
  return approveRequestImpl(formData)
}

export async function declineRequest(formData: FormData) {
  return declineRequestImpl(formData)
}

export async function moveBookingToRoomAndDates(
  bookingId: string,
  newRoomId: string,
  newCheckIn: string,
  newCheckOut: string
): Promise<{ ok?: true; error?: string }> {
  return moveBookingToRoomAndDatesImpl(
    bookingId,
    newRoomId,
    newCheckIn,
    newCheckOut
  )
}

// ─── /bedrooms/actions wrappers ──────────────────────────────────────

export async function movePillToBed(
  bookingId: string,
  newBedId: string
): Promise<{ ok?: true; error?: string }> {
  return movePillToBedImpl(bookingId, newBedId)
}

export async function addGuestToFirstAvailableBed(
  requestId: string,
  guestName: string
): Promise<{ ok?: true; error?: string }> {
  return addGuestToFirstAvailableBedImpl(requestId, guestName)
}

export async function renameGuest(
  bookingId: string,
  newName: string
): Promise<{ ok?: true; error?: string }> {
  return renameGuestImpl(bookingId, newName)
}

export async function removeGuest(
  bookingId: string
): Promise<{ ok?: true; error?: string }> {
  return removeGuestImpl(bookingId)
}

export async function togglePrearrivalCheck(
  requestId: string,
  templateId: string,
  roomId: string,
  shouldCheck: boolean
): Promise<{ ok?: true; error?: string }> {
  return togglePrearrivalCheckImpl(
    requestId,
    templateId,
    roomId,
    shouldCheck
  )
}

// ─── Panel-specific actions ──────────────────────────────────────────

/**
 * Cancel an approved booking_request. Sets status='cancelled' and
 * removes the bed-level bookings rows. Differs from declineRequest,
 * which is for still-pending requests.
 */
export async function cancelApprovedBooking(
  requestId: string
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  if (!requestId) return { error: 'Missing booking id' }

  const supabase = await createClient()

  // Mark the request cancelled
  const { error: reqErr } = await supabase
    .from('booking_requests')
    .update({
      status: 'cancelled',
      decided_at: new Date().toISOString(),
    })
    .eq('id', requestId)

  if (reqErr) return { error: reqErr.message }

  // Remove bed-level bookings (cascades cleanly)
  const { error: bookErr } = await supabase
    .from('bookings')
    .delete()
    .eq('request_id', requestId)

  if (bookErr) return { error: bookErr.message }

  revalidatePath('/house')
  revalidatePath('/bookings')
  return { ok: true }
}

/**
 * Edit the dates of an approved booking_request. Updates the request
 * itself AND all of its bed-level bookings atomically, with conflict
 * detection across overlapping bookings on those beds.
 *
 * Date semantics: check_in and check_out are ISO dates (YYYY-MM-DD).
 * check_out > check_in (one-night stay = check_in 5th, check_out 6th).
 */
export async function editRequestDates(
  requestId: string,
  newCheckIn: string,
  newCheckOut: string
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  if (!requestId) return { error: 'Missing booking id' }
  if (!newCheckIn || !newCheckOut) return { error: 'Missing dates' }
  if (newCheckIn >= newCheckOut) {
    return { error: 'Check-out must be after check-in.' }
  }

  // Fetch all bed-level bookings under this request so we know which
  // beds need to be re-checked for conflicts.
  const { data: childBookings, error: cbErr } = await supabase
    .from('bookings')
    .select('id, bed_id')
    .eq('request_id', requestId)
  if (cbErr) return { error: cbErr.message }

  const bedIds = (childBookings ?? []).map((b: any) => b.bed_id).filter(Boolean)

  // Conflict check: any other approved booking on the same beds that
  // overlaps the new date range, excluding our own bookings.
  if (bedIds.length > 0) {
    const ourBookingIds = new Set((childBookings ?? []).map((b: any) => b.id))
    const { data: overlapping, error: confErr } = await supabase
      .from('bookings')
      .select(
        'id, bed_id, check_in, check_out, guest_name, beds:beds!bookings_bed_id_fkey(name)'
      )
      .eq('status', 'approved')
      .in('bed_id', bedIds)
      .lt('check_in', newCheckOut)
      .gt('check_out', newCheckIn)
    if (confErr) return { error: confErr.message }
    const conflicts = (overlapping ?? []).filter(
      (b: any) => !ourBookingIds.has(b.id)
    )
    if (conflicts.length > 0) {
      const c = conflicts[0] as any
      const bedName = c.beds?.name ?? 'a bed'
      const who = c.guest_name ?? 'another guest'
      return {
        error: `Can't move to those dates — ${who} is already in ${bedName} during that range.`,
      }
    }
  }

  // Update the request first
  const { error: reqErr } = await supabase
    .from('booking_requests')
    .update({
      check_in: newCheckIn,
      check_out: newCheckOut,
    })
    .eq('id', requestId)
  if (reqErr) return { error: reqErr.message }

  // Then all child bookings — they all share the request's dates
  if ((childBookings?.length ?? 0) > 0) {
    const { error: bErr } = await supabase
      .from('bookings')
      .update({
        check_in: newCheckIn,
        check_out: newCheckOut,
      })
      .eq('request_id', requestId)
    if (bErr) return { error: bErr.message }
  }

  revalidatePath('/house')
  revalidatePath('/bookings')
  return { ok: true }
}

/**
 * Manually create a booking on someone's behalf — skips the
 * request-and-approve flow entirely.
 *
 * Form fields:
 *   requested_by (uuid)   — which user the booking is for
 *   check_in     (ISO)
 *   check_out    (ISO)
 *   adults       (int)
 *   children     (int, default 0)
 *   notes        (optional)
 *
 * Creates an approved booking_request. No bed assignments are made
 * automatically — admin assigns beds via the slide-over after creation.
 *
 * Returns the new request_id so the UI can open the panel on it.
 */
export async function createBookingForUser(
  formData: FormData
): Promise<{ ok?: true; request_id?: string; error?: string }> {
  const profile = await requireAdmin()
  const supabase = await createClient()

  const requestedBy = String(formData.get('requested_by') ?? '').trim()
  const checkIn = String(formData.get('check_in') ?? '').trim()
  const checkOut = String(formData.get('check_out') ?? '').trim()
  const adultsRaw = String(formData.get('adults') ?? '1').trim()
  const childrenRaw = String(formData.get('children') ?? '0').trim()
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!requestedBy) return { error: 'Pick a user to book on behalf of' }
  if (!checkIn || !checkOut) return { error: 'Missing dates' }
  if (checkIn >= checkOut) return { error: 'Check-out must be after check-in' }

  const adults = parseInt(adultsRaw, 10)
  const children = parseInt(childrenRaw, 10)
  if (!Number.isFinite(adults) || adults < 1 || adults > 20) {
    return { error: 'Adults must be between 1 and 20' }
  }
  if (!Number.isFinite(children) || children < 0 || children > 20) {
    return { error: 'Children must be between 0 and 20' }
  }

  // Verify the target user exists
  const { data: targetProfile, error: targetErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', requestedBy)
    .single()
  if (targetErr || !targetProfile) {
    return { error: 'That user account no longer exists.' }
  }

  // Insert directly as approved
  const { data: row, error: insErr } = await supabase
    .from('booking_requests')
    .insert({
      requested_by: requestedBy,
      check_in: checkIn,
      check_out: checkOut,
      adults,
      children,
      notes,
      status: 'approved',
      decided_at: new Date().toISOString(),
      decided_by: profile.id,
    })
    .select('id')
    .single()

  if (insErr || !row) {
    return { error: insErr?.message ?? 'Failed to create booking' }
  }

  revalidatePath('/house')
  revalidatePath('/bookings')
  return { ok: true, request_id: row.id }
}

/**
 * Permanently delete a booking_request and all its bed-level bookings,
 * children rows, and prearrival checks. No audit trail kept.
 *
 * Safety: only allowed on bookings that are already cancelled or
 * declined. Deleting an active booking would silently destroy a guest's
 * confirmed stay — too risky.
 */
export async function deleteBookingPermanently(
  requestId: string
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  if (!requestId) return { error: 'Missing booking id' }

  // Verify the booking is in a terminal state
  const { data: req, error: rErr } = await supabase
    .from('booking_requests')
    .select('id, status')
    .eq('id', requestId)
    .single()
  if (rErr || !req) {
    return { error: rErr?.message ?? 'Booking not found' }
  }
  if (req.status === 'approved' || req.status === 'pending') {
    return {
      error:
        'Cancel or decline this booking first. Only cancelled/declined bookings can be deleted.',
    }
  }

  // Delete in dependency order. Most child tables have ON DELETE CASCADE
  // from the booking_requests FK, but we delete explicitly for clarity
  // and to handle any tables without cascade.
  const tablesToWipe = [
    { table: 'bookings', col: 'request_id' },
    { table: 'booking_request_children', col: 'request_id' },
    { table: 'prearrival_checks', col: 'booking_request_id' },
  ]
  for (const t of tablesToWipe) {
    const { error: dErr } = await supabase
      .from(t.table)
      .delete()
      .eq(t.col, requestId)
    if (dErr) {
      return { error: `Failed to clear ${t.table}: ${dErr.message}` }
    }
  }

  // Finally the request itself
  const { error: finalErr } = await supabase
    .from('booking_requests')
    .delete()
    .eq('id', requestId)
  if (finalErr) return { error: finalErr.message }

  revalidatePath('/house')
  revalidatePath('/bookings')
  return { ok: true }
}

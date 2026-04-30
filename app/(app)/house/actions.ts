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

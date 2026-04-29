'use server'

/**
 * Action layer for the unified House page.
 *
 * The heavy lifting (approve/decline, calendar move, bed pill move, conflict
 * pre-checks, friendly errors) already lives in the existing actions files
 * for /admin/bookings and /bedrooms. We re-export them here so the House
 * page imports from one place, then add a couple of panel-specific actions
 * at the bottom.
 */

export {
  approveRequest,
  declineRequest,
  moveBookingToRoomAndDates,
} from '../admin/bookings/actions'

export {
  movePillToBed,
  addGuestToFirstAvailableBed,
  renameGuest,
  removeGuest,
  togglePrearrivalCheck,
} from '../bedrooms/actions'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

/**
 * Cancel an approved booking_request. Sets status='cancelled' and removes
 * the bed-level bookings rows. Differs from declineRequest, which is for
 * still-pending requests.
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

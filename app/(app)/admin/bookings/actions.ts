'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { logAdminAction } from '@/lib/audit'

export async function approveRequest(formData: FormData) {
  const user = await requireAdmin()
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/house')

  const supabase = await createClient()

  const { error } = await supabase
    .from('booking_requests')
    .update({
      status: 'approved',
      decided_at: new Date().toISOString(),
      decided_by: user.id,
    })
    .eq('id', id)
    .eq('status', 'pending')

  if (error) {
    redirect(
      `/house?error=${encodeURIComponent(error.message)}`
    )
  }

  await logAdminAction({
    actorId: user.id,
    action: 'booking.approve',
    targetKind: 'booking_request',
    targetId: id,
  })

  revalidatePath('/house')
  revalidatePath('/admin/bookings')
  revalidatePath('/dashboard')
  revalidatePath('/bookings')
  // Land back on the request inside the slide-over so the user sees the
  // newly-approved booking with bed-assignment UI ready.
  redirect(`/house?request=${id}&saved=Approved`)
}

export async function declineRequest(formData: FormData) {
  const user = await requireAdmin()
  const id = String(formData.get('id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim() || null
  if (!id) redirect('/house')

  const supabase = await createClient()

  const { error } = await supabase
    .from('booking_requests')
    .update({
      status: 'declined',
      admin_notes: reason,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
    })
    .eq('id', id)
    .eq('status', 'pending')

  if (error) {
    redirect(
      `/house?error=${encodeURIComponent(error.message)}`
    )
  }

  await logAdminAction({
    actorId: user.id,
    action: 'booking.decline',
    targetKind: 'booking_request',
    targetId: id,
    payload: reason ? { reason } : {},
  })

  revalidatePath('/house')
  revalidatePath('/admin/bookings')
  revalidatePath('/dashboard')
  revalidatePath('/bookings')
  redirect('/house?saved=Declined')
}

/**
 * Move a booking to a different room and/or date range. Used by the
 * drag-drop on the calendar grid.
 *
 * - newRoomId: the room the booking should be in. We pick a free bed in
 *   that room (matching bed-type if possible, else first free).
 * - newCheckIn / newCheckOut: ISO date strings (YYYY-MM-DD).
 *
 * Returns { ok } on success or { error } if the move would create a
 * conflict (overlapping booking on the chosen bed) or if no free bed
 * exists in the target room.
 */
export async function moveBookingToRoomAndDates(
  bookingId: string,
  newRoomId: string,
  newCheckIn: string,
  newCheckOut: string
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  // Verify admin via profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if ((profile as any)?.role !== 'admin') {
    return { error: 'Only admins can move bookings.' }
  }

  if (!bookingId || !newRoomId || !newCheckIn || !newCheckOut) {
    return { error: 'Missing details' }
  }
  if (newCheckIn >= newCheckOut) {
    return { error: 'Check-in must be before check-out.' }
  }

  // Fetch the booking we're moving
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select(
      'id, bed_id, request_id, beds:beds!bookings_bed_id_fkey(room_id, bed_type)',
    )
    .eq('id', bookingId)
    .single()
  if (bookingErr || !booking) {
    return { error: bookingErr?.message ?? 'Booking not found' }
  }

  const currentRoomId = (booking.beds as any)?.room_id
  const currentBedType = (booking.beds as any)?.bed_type
  const currentBedId = (booking as any).bed_id
  const movingRequestId = (booking as any).request_id

  // Find candidate beds in the target room
  const { data: candidateBeds, error: bedsErr } = await supabase
    .from('beds')
    .select('id, bed_type')
    .eq('room_id', newRoomId)
  if (bedsErr) return { error: bedsErr.message }
  if (!candidateBeds || candidateBeds.length === 0) {
    return { error: 'No beds in the target room.' }
  }

  // Find existing bookings on those beds that overlap the new dates,
  // EXCLUDING:
  //   - the booking we're moving itself
  //   - bookings that share the same request_id (couples sharing a bed
  //     within the same booking is allowed — must match the trigger logic)
  const candidateBedIds = candidateBeds.map((b: any) => b.id)
  const { data: conflicts } = await supabase
    .from('bookings')
    .select('id, bed_id, request_id')
    .eq('status', 'approved')
    .in('bed_id', candidateBedIds)
    .lt('check_in', newCheckOut)
    .gt('check_out', newCheckIn)
    .neq('id', bookingId)

  const conflictBedIds = new Set(
    (conflicts ?? [])
      .filter((c: any) => {
        // Treat as conflict only if it's a DIFFERENT booking_request.
        // Null-request rows (legacy/orphan) are conservatively conflicts.
        if (!c.request_id || !movingRequestId) return true
        return c.request_id !== movingRequestId
      })
      .map((c: any) => c.bed_id),
  )

  // If we're staying in the same room, prefer keeping the same bed.
  let chosenBedId: string | null = null
  if (
    currentRoomId === newRoomId &&
    !conflictBedIds.has(currentBedId)
  ) {
    chosenBedId = currentBedId
  }
  // Otherwise prefer matching bed_type, else any free bed
  if (!chosenBedId) {
    const sameType = candidateBeds.find(
      (b: any) =>
        b.bed_type === currentBedType && !conflictBedIds.has(b.id)
    )
    chosenBedId = (sameType as any)?.id ?? null
  }
  if (!chosenBedId) {
    const anyFree = candidateBeds.find(
      (b: any) => !conflictBedIds.has(b.id)
    )
    chosenBedId = (anyFree as any)?.id ?? null
  }

  if (!chosenBedId) {
    return {
      error:
        'No free bed in that room for those dates — another booking already overlaps.',
    }
  }

  // Apply the move
  const { error: updateErr } = await supabase
    .from('bookings')
    .update({
      bed_id: chosenBedId,
      check_in: newCheckIn,
      check_out: newCheckOut,
    })
    .eq('id', bookingId)

  if (updateErr) return { error: updateErr.message }

  revalidatePath('/admin/bookings')
  revalidatePath('/house')
  revalidatePath('/bedrooms')
  revalidatePath('/dashboard')
  return { ok: true }
}

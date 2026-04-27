'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, requireProfile } from '@/lib/auth'

/** Move a guest pill (a `bookings` row) from its current bed to another. */
export async function movePillToBed(
  bookingId: string,
  newBedId: string
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  if (!bookingId || !newBedId) return { error: 'Missing ids' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('bookings')
    .update({ bed_id: newBedId })
    .eq('id', bookingId)

  if (error) return { error: error.message }

  revalidatePath('/bedrooms')
  revalidatePath('/house')
  return { ok: true }
}

/**
 * Add a new guest to a booking_request. Looks for the first bed in the
 * house that doesn't already have a `bookings` row for this date range,
 * and assigns the new guest there.
 */
export async function addGuestToFirstAvailableBed(
  requestId: string,
  guestName: string
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireAdmin()
  if (!requestId || !guestName) return { error: 'Missing details' }

  const supabase = await createClient()

  // Pull the request for dates
  const { data: req } = await supabase
    .from('booking_requests')
    .select('id, requested_by, check_in, check_out')
    .eq('id', requestId)
    .single()

  if (!req) return { error: 'Booking request not found' }

  // Find an available bed: a bedroom-bed in a non-owner-room with no
  // overlapping approved booking. (Admin can still drag a pill into an
  // owner room manually after it's been added.)
  const { data: allBeds } = await supabase
    .from('beds')
    .select('id, rooms!inner(id, is_owner_room, room_type)')
    .eq('rooms.is_owner_room', false)
    .eq('rooms.room_type', 'bedroom')
    .order('name')

  const { data: occupied } = await supabase
    .from('bookings')
    .select('bed_id')
    .eq('status', 'approved')
    .lt('check_in', (req as any).check_out)
    .gt('check_out', (req as any).check_in)

  const occupiedSet = new Set((occupied ?? []).map((b: any) => b.bed_id))
  const freeBed = (allBeds ?? []).find((b: any) => !occupiedSet.has(b.id))

  if (!freeBed) {
    return {
      error:
        'No free guest beds for these dates. Move a pill off a bed first, or drag onto an owner room manually.',
    }
  }

  const { error } = await supabase.from('bookings').insert({
    bed_id: (freeBed as any).id,
    request_id: requestId,
    requested_by: (req as any).requested_by,
    guest_name: guestName,
    check_in: (req as any).check_in,
    check_out: (req as any).check_out,
    status: 'approved',
    approved_at: new Date().toISOString(),
    approved_by: profile.id,
  })

  if (error) return { error: error.message }

  revalidatePath('/bedrooms')
  revalidatePath('/house')
  return { ok: true }
}

/** Rename a guest pill. */
export async function renameGuest(
  bookingId: string,
  newName: string
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  if (!bookingId || !newName) return { error: 'Missing details' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('bookings')
    .update({ guest_name: newName })
    .eq('id', bookingId)

  if (error) return { error: error.message }

  revalidatePath('/bedrooms')
  return { ok: true }
}

/** Delete a guest pill (removes the bookings row entirely). */
export async function removeGuest(
  bookingId: string
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  if (!bookingId) return { error: 'Missing booking id' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', bookingId)

  if (error) return { error: error.message }

  revalidatePath('/bedrooms')
  revalidatePath('/house')
  return { ok: true }
}

/** Tick or untick a pre-arrival checklist item for a booking-room combo. */
export async function togglePrearrivalCheck(
  requestId: string,
  templateId: string,
  roomId: string,
  shouldCheck: boolean
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireProfile()
  if (profile.role !== 'admin' && profile.role !== 'cleaner') {
    return { error: 'Only admins and cleaners can update checklists.' }
  }
  if (!requestId || !templateId) return { error: 'Missing details' }

  const supabase = await createClient()

  if (shouldCheck) {
    // upsert: insert if not exists. The unique(booking_request_id, template_id)
    // constraint prevents duplicates.
    const { error } = await supabase
      .from('prearrival_checks')
      .upsert(
        {
          booking_request_id: requestId,
          template_id: templateId,
          room_id: roomId,
          checked_by: profile.id,
        },
        { onConflict: 'booking_request_id,template_id' }
      )
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('prearrival_checks')
      .delete()
      .eq('booking_request_id', requestId)
      .eq('template_id', templateId)
    if (error) return { error: error.message }
  }

  revalidatePath('/bedrooms')
  return { ok: true }
}

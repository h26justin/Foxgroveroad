'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, requireProfile } from '@/lib/auth'

/**
 * Translate a raw Postgres / Supabase error message into something a
 * non-technical user can actually act on. Covers the trigger-based
 * overlap protection and FK violations.
 */
function friendlyError(message: string | undefined | null): string {
  if (!message) return 'Something went wrong.'
  // The DB trigger raises e.g.:
  //   "Bed 3a84569e-... already has an approved booking overlapping these dates"
  if (/already has an approved booking/i.test(message)) {
    return 'That bed already has another booking on those dates.'
  }
  if (/violates foreign key/i.test(message)) {
    return 'That booking or bed no longer exists.'
  }
  if (/duplicate key/i.test(message)) {
    return 'That guest is already in this booking.'
  }
  return message
}

/**
 * Move a guest pill (a `bookings` row) from its current bed to another.
 * Pre-checks for conflicts so the UI gets a clean error instead of
 * relying on the DB trigger.
 */
export async function movePillToBed(
  bookingId: string,
  newBedId: string
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  if (!bookingId || !newBedId) return { error: 'Missing ids' }

  const supabase = await createClient()

  // Pull the booking's date range
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, bed_id, check_in, check_out')
    .eq('id', bookingId)
    .single()
  if (bookingErr || !booking) {
    return { error: friendlyError(bookingErr?.message ?? 'Booking not found') }
  }

  // No-op if dropping on the same bed
  if ((booking as any).bed_id === newBedId) {
    return { ok: true }
  }

  // Pre-flight: is the destination bed already booked for these dates?
  const { data: conflicts } = await supabase
    .from('bookings')
    .select('id, guest_name')
    .eq('bed_id', newBedId)
    .eq('status', 'approved')
    .lt('check_in', (booking as any).check_out)
    .gt('check_out', (booking as any).check_in)
    .neq('id', bookingId)

  if (conflicts && conflicts.length > 0) {
    const occupantName = (conflicts[0] as any).guest_name || 'another guest'
    return {
      error: `That bed is already taken by ${occupantName} on those dates.`,
    }
  }

  const { error } = await supabase
    .from('bookings')
    .update({ bed_id: newBedId })
    .eq('id', bookingId)

  if (error) return { error: friendlyError(error.message) }

  revalidatePath('/bedrooms')
  revalidatePath('/house')
  return { ok: true }
}

/**
 * Add a new guest to a booking_request. Looks for the first guest bed
 * (non-owner bedroom) without an overlapping booking, and creates a
 * `bookings` row there.
 */
export async function addGuestToFirstAvailableBed(
  requestId: string,
  guestName: string
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireAdmin()
  if (!requestId || !guestName) return { error: 'Missing details' }

  const supabase = await createClient()

  const { data: req } = await supabase
    .from('booking_requests')
    .select('id, requested_by, check_in, check_out')
    .eq('id', requestId)
    .single()
  if (!req) return { error: 'Booking request not found' }

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
        'No free guest beds for these dates. Move someone off a bed first, or drag this guest into the Master Bedroom manually.',
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

  if (error) return { error: friendlyError(error.message) }

  revalidatePath('/bedrooms')
  revalidatePath('/house')
  return { ok: true }
}

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

  if (error) return { error: friendlyError(error.message) }

  revalidatePath('/bedrooms')
  return { ok: true }
}

export async function removeGuest(
  bookingId: string
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  if (!bookingId) return { error: 'Missing booking id' }

  const supabase = await createClient()
  const { error } = await supabase.from('bookings').delete().eq('id', bookingId)

  if (error) return { error: friendlyError(error.message) }

  revalidatePath('/bedrooms')
  revalidatePath('/house')
  return { ok: true }
}

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
    if (error) return { error: friendlyError(error.message) }
  } else {
    const { error } = await supabase
      .from('prearrival_checks')
      .delete()
      .eq('booking_request_id', requestId)
      .eq('template_id', templateId)
    if (error) return { error: friendlyError(error.message) }
  }

  revalidatePath('/bedrooms')
  return { ok: true }
}

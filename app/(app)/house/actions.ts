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

/**
 * Create an approved booking with a list of guests staying. Replaces
 * createBookingForUser for the new admin booking flow.
 *
 * The form submits:
 *   check_in, check_out
 *   adults, children
 *   notes (optional)
 *   guests — JSON-stringified array of:
 *       { guest_id?: string }                     // existing guest
 *       | { full_name: string, link_profile_id?: string }  // new guest
 *
 * Behaviour:
 *   - The booking_requests.requested_by is set to the calling admin's
 *     own profile id (audit trail for "who created this booking").
 *   - For each new-guest entry, a guests row is created auto-magically
 *     (so admin doesn't have to pre-add guests separately).
 *   - All resolved guests are attached via booking_request_guests.
 *
 * Returns the new request_id so the UI can navigate to /house?request=…
 * and let admin assign beds via the panel.
 */
export async function createBookingWithGuests(
  formData: FormData,
): Promise<{ ok?: true; request_id?: string; error?: string }> {
  const profile = await requireAdmin()
  const supabase = await createClient()

  const checkIn = String(formData.get('check_in') ?? '').trim()
  const checkOut = String(formData.get('check_out') ?? '').trim()
  const adultsRaw = String(formData.get('adults') ?? '1').trim()
  const childrenRaw = String(formData.get('children') ?? '0').trim()
  const notes = String(formData.get('notes') ?? '').trim() || null
  const guestsJson = String(formData.get('guests') ?? '[]')

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

  // Parse guest list
  type GuestEntry =
    | { guest_id: string }
    | { full_name: string; link_profile_id?: string }
  let guests: GuestEntry[]
  try {
    guests = JSON.parse(guestsJson) as GuestEntry[]
    if (!Array.isArray(guests)) throw new Error('guests is not an array')
  } catch {
    return { error: 'Invalid guests payload' }
  }
  if (guests.length === 0) {
    return { error: 'Add at least one guest staying' }
  }
  if (guests.length > 30) {
    return { error: 'That is a lot of guests — maximum 30' }
  }

  // Resolve each entry to a guest_id, auto-creating new guests as needed.
  const resolvedGuestIds: string[] = []
  for (const entry of guests) {
    if ('guest_id' in entry && entry.guest_id) {
      // Verify the id exists (cheap sanity check)
      const { data: g } = await supabase
        .from('guests')
        .select('id')
        .eq('id', entry.guest_id)
        .maybeSingle()
      if (!g) {
        return {
          error: 'One of the picked guests no longer exists. Refresh and try again.',
        }
      }
      resolvedGuestIds.push(entry.guest_id)
    } else if ('full_name' in entry && entry.full_name?.trim()) {
      const name = entry.full_name.trim()
      if (name.length > 200) {
        return { error: `Name "${name.slice(0, 30)}…" is too long` }
      }
      // Optional: link to a profile if requested + that profile isn't
      // already linked to a different guest.
      let linkProfileId: string | null = null
      if ('link_profile_id' in entry && entry.link_profile_id) {
        const { data: existing } = await supabase
          .from('guests')
          .select('id, full_name')
          .eq('linked_profile_id', entry.link_profile_id)
          .maybeSingle()
        if (existing) {
          return {
            error: `That account is already linked to guest "${existing.full_name}". Pick that guest instead, or unlink first.`,
          }
        }
        linkProfileId = entry.link_profile_id
      }
      // Auto-create the guest record
      const { data: created, error: gErr } = await supabase
        .from('guests')
        .insert({
          full_name: name,
          linked_profile_id: linkProfileId,
          created_by: profile.id,
        })
        .select('id')
        .single()
      if (gErr || !created) {
        return {
          error: `Failed to add guest "${name}": ${gErr?.message ?? 'unknown'}`,
        }
      }
      resolvedGuestIds.push(created.id)
    } else {
      return { error: 'Empty guest entry — type a name or pick from the list' }
    }
  }

  // Insert the booking_request as approved
  const { data: row, error: insErr } = await supabase
    .from('booking_requests')
    .insert({
      requested_by: profile.id, // admin who created it
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
  const requestId = row.id

  // Attach guests via the join table
  const joinRows = resolvedGuestIds.map((guestId, i) => ({
    request_id: requestId,
    guest_id: guestId,
    position: i,
  }))
  const { error: joinErr } = await supabase
    .from('booking_request_guests')
    .insert(joinRows)
  if (joinErr) {
    // Non-fatal — booking exists. Surface to admin so they can retry.
    return {
      error: `Booking created but guests failed to attach: ${joinErr.message}. Add them manually in the panel.`,
    }
  }

  revalidatePath('/house')
  revalidatePath('/bookings')
  return { ok: true, request_id: requestId }
}

/**
 * Assign a canonical guest from the booking's guest list to a specific
 * bed. Creates a `bookings` row with both guest_id (canonical link) and
 * guest_name (snapshot of the guest's name for display).
 *
 * If the guest is already on another bed, that bed booking is moved
 * (not duplicated) — same canonical guest in two beds would be weird.
 */
export async function assignCanonicalGuestToBed(
  requestId: string,
  guestId: string,
  bedId: string,
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireAdmin()
  const supabase = await createClient()

  if (!requestId || !guestId || !bedId) return { error: 'Missing details' }

  // Fetch parent request + the guest's canonical name
  const [reqRes, guestRes] = await Promise.all([
    supabase
      .from('booking_requests')
      .select('id, requested_by, check_in, check_out')
      .eq('id', requestId)
      .single(),
    supabase
      .from('guests')
      .select('id, full_name')
      .eq('id', guestId)
      .single(),
  ])

  if (reqRes.error || !reqRes.data) {
    return { error: 'Booking request not found' }
  }
  if (guestRes.error || !guestRes.data) {
    return { error: 'Guest not found — refresh and try again' }
  }
  const req = reqRes.data as any
  const guest = guestRes.data as any

  // Verify the bed isn't already occupied by another booking on these
  // dates. RLS handles permissions; this is a UX guard.
  const { data: conflicts } = await supabase
    .from('bookings')
    .select('id, request_id')
    .eq('bed_id', bedId)
    .eq('status', 'approved')
    .lt('check_in', req.check_out)
    .gt('check_out', req.check_in)

  const conflictingOther = (conflicts ?? []).find(
    (b: any) => b.request_id !== requestId,
  )
  if (conflictingOther) {
    return {
      error: 'That bed is occupied by another booking on these dates.',
    }
  }

  // If the same canonical guest is already on a different bed for this
  // booking, move them (delete the old, insert the new). Otherwise
  // just insert.
  const { data: existingForGuest } = await supabase
    .from('bookings')
    .select('id, bed_id')
    .eq('request_id', requestId)
    .eq('guest_id', guestId)
    .eq('status', 'approved')

  if (existingForGuest && existingForGuest.length > 0) {
    // If they're already on the target bed, no-op
    if (existingForGuest.some((b: any) => b.bed_id === bedId)) {
      return { ok: true }
    }
    // Update the existing row to the new bed
    const { error: updErr } = await supabase
      .from('bookings')
      .update({ bed_id: bedId })
      .eq('id', existingForGuest[0].id)
    if (updErr) return { error: updErr.message }
    revalidatePath('/house')
    revalidatePath('/bedrooms')
    return { ok: true }
  }

  // Insert a fresh bed booking for this guest
  const { error: insErr } = await supabase.from('bookings').insert({
    bed_id: bedId,
    request_id: requestId,
    requested_by: req.requested_by,
    guest_id: guestId,
    guest_name: guest.full_name, // snapshot
    check_in: req.check_in,
    check_out: req.check_out,
    status: 'approved',
    approved_at: new Date().toISOString(),
    approved_by: profile.id,
  })

  if (insErr) return { error: insErr.message }

  revalidatePath('/house')
  revalidatePath('/bedrooms')
  return { ok: true }
}

/**
 * Add a guest to an existing booking's guest list. Either picks an
 * existing guest (`guest_id`) or auto-creates one from a typed name.
 *
 * Does NOT assign to a bed — that's a separate step. The new entry
 * appears as "unassigned" in the panel until admin drags it.
 *
 * Form fields:
 *   request_id        — required
 *   guest_id          — optional (existing guest)
 *   full_name         — optional (new guest, auto-created)
 *   link_profile_id   — optional (link new guest to an account)
 */
export async function addGuestToBookingList(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireAdmin()
  const supabase = await createClient()

  const requestId = String(formData.get('request_id') ?? '').trim()
  const guestIdInput = String(formData.get('guest_id') ?? '').trim()
  const fullName = String(formData.get('full_name') ?? '').trim()
  const linkProfileId = String(formData.get('link_profile_id') ?? '').trim() || null

  if (!requestId) return { error: 'Missing booking id' }
  if (!guestIdInput && !fullName) {
    return { error: 'Pick a saved guest or type a new name' }
  }

  let guestId = guestIdInput

  // Auto-create if a new name was typed
  if (!guestId && fullName) {
    if (fullName.length > 200) {
      return { error: 'Name is too long' }
    }
    if (linkProfileId) {
      const { data: existing } = await supabase
        .from('guests')
        .select('id, full_name')
        .eq('linked_profile_id', linkProfileId)
        .maybeSingle()
      if (existing) {
        return {
          error: `That account is already linked to "${existing.full_name}". Pick that guest instead.`,
        }
      }
    }
    const { data: created, error: cErr } = await supabase
      .from('guests')
      .insert({
        full_name: fullName,
        linked_profile_id: linkProfileId,
        created_by: profile.id,
      })
      .select('id')
      .single()
    if (cErr || !created) {
      return { error: cErr?.message ?? 'Failed to add guest' }
    }
    guestId = created.id
  }

  // Determine next position
  const { data: existingRows } = await supabase
    .from('booking_request_guests')
    .select('position')
    .eq('request_id', requestId)
    .order('position', { ascending: false })
    .limit(1)
  const nextPos = ((existingRows as any[])?.[0]?.position ?? -1) + 1

  // Insert the join row (unique constraint prevents duplicates)
  const { error: joinErr } = await supabase
    .from('booking_request_guests')
    .insert({
      request_id: requestId,
      guest_id: guestId,
      position: nextPos,
    })
  if (joinErr) {
    if ((joinErr.message ?? '').toLowerCase().includes('duplicate')) {
      return { error: 'That guest is already on this booking.' }
    }
    return { error: joinErr.message }
  }

  revalidatePath('/house')
  revalidatePath('/bedrooms')
  return { ok: true }
}

/**
 * Remove a canonical guest from a booking's guest list. If they're
 * currently assigned to any bed for this booking, those bed bookings
 * are deleted too.
 */
export async function removeGuestFromBookingList(
  requestId: string,
  guestId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  if (!requestId || !guestId) return { error: 'Missing details' }

  // Delete any bed bookings for this (request, guest) combo
  const { error: bedErr } = await supabase
    .from('bookings')
    .delete()
    .eq('request_id', requestId)
    .eq('guest_id', guestId)
  if (bedErr) return { error: `Failed to clear beds: ${bedErr.message}` }

  // Delete the join row
  const { error: joinErr } = await supabase
    .from('booking_request_guests')
    .delete()
    .eq('request_id', requestId)
    .eq('guest_id', guestId)
  if (joinErr) return { error: joinErr.message }

  revalidatePath('/house')
  revalidatePath('/bedrooms')
  return { ok: true }
}

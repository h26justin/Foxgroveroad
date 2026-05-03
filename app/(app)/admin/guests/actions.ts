'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'

/**
 * Create a new guest record. Admin-only.
 *
 * Form fields:
 *   full_name         — required, 1-200 chars
 *   linked_profile_id — optional uuid; if provided, links this guest to
 *                       an account holder
 *
 * Returns the new guest id (used by callers that want to navigate to
 * the detail page) or an error.
 */
export async function createGuest(
  formData: FormData,
): Promise<{ ok?: true; guest_id?: string; error?: string }> {
  const profile = await requireAdmin()
  const supabase = await createClient()

  const fullName = String(formData.get('full_name') ?? '').trim()
  const linkedProfileIdRaw = String(formData.get('linked_profile_id') ?? '').trim()
  const linkedProfileId = linkedProfileIdRaw || null

  if (!fullName) return { error: 'Name is required' }
  if (fullName.length > 200) return { error: 'Name is too long' }

  // If a profile link is requested, make sure that profile exists and
  // isn't already linked to a different guest.
  if (linkedProfileId) {
    const { data: existing } = await supabase
      .from('guests')
      .select('id, full_name')
      .eq('linked_profile_id', linkedProfileId)
      .maybeSingle()
    if (existing) {
      return {
        error: `That account is already linked to guest "${existing.full_name}". Unlink there first.`,
      }
    }
  }

  const { data: row, error } = await supabase
    .from('guests')
    .insert({
      full_name: fullName,
      linked_profile_id: linkedProfileId,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (error || !row) return { error: error?.message ?? 'Failed to create guest' }

  revalidatePath('/admin/guests')
  revalidatePath('/house')
  return { ok: true, guest_id: row.id }
}

/**
 * Update a guest's name + notes. Admin-only.
 *
 * Form fields:
 *   guest_id          — required
 *   full_name         — required, 1-200 chars
 *   dietary_notes, allergies, room_preference, things_they_bring,
 *   general_notes     — all optional (empty = NULL)
 */
export async function updateGuest(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  const guestId = String(formData.get('guest_id') ?? '').trim()
  const fullName = String(formData.get('full_name') ?? '').trim()
  if (!guestId) return { error: 'Missing guest id' }
  if (!fullName) return { error: 'Name is required' }
  if (fullName.length > 200) return { error: 'Name is too long' }

  function readField(name: string, max: number): string | null {
    const raw = String(formData.get(name) ?? '').trim()
    if (!raw) return null
    if (raw.length > max) {
      throw new Error(
        `${name.replace(/_/g, ' ')} is too long (max ${max} chars)`,
      )
    }
    return raw
  }

  let dietary, allergies, roomPref, thingsBring, general
  try {
    dietary = readField('dietary_notes', 500)
    allergies = readField('allergies', 500)
    roomPref = readField('room_preference', 500)
    thingsBring = readField('things_they_bring', 500)
    general = readField('general_notes', 1000)
  } catch (e: any) {
    return { error: e?.message ?? 'Validation failed' }
  }

  const { error } = await supabase
    .from('guests')
    .update({
      full_name: fullName,
      dietary_notes: dietary,
      allergies,
      room_preference: roomPref,
      things_they_bring: thingsBring,
      general_notes: general,
    })
    .eq('id', guestId)

  if (error) return { error: error.message }

  revalidatePath('/admin/guests')
  revalidatePath(`/admin/guests/${guestId}`)
  revalidatePath('/house')
  return { ok: true }
}

/**
 * Link an existing guest to an account holder. The profile must not
 * already be linked elsewhere.
 */
export async function linkGuestToProfile(
  guestId: string,
  profileId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  if (!guestId || !profileId) return { error: 'Missing details' }

  // Guard: profile not already linked to another guest
  const { data: existing } = await supabase
    .from('guests')
    .select('id, full_name')
    .eq('linked_profile_id', profileId)
    .maybeSingle()
  if (existing && existing.id !== guestId) {
    return {
      error: `That account is already linked to guest "${existing.full_name}". Unlink there first.`,
    }
  }

  const { error } = await supabase
    .from('guests')
    .update({ linked_profile_id: profileId })
    .eq('id', guestId)

  if (error) return { error: error.message }

  revalidatePath('/admin/guests')
  revalidatePath(`/admin/guests/${guestId}`)
  revalidatePath('/house')
  return { ok: true }
}

/**
 * Remove the link between a guest and an account holder. The guest
 * record stays (with all its notes); the account just isn't pointed
 * at it anymore.
 */
export async function unlinkGuestFromProfile(
  guestId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  if (!guestId) return { error: 'Missing guest id' }

  const { error } = await supabase
    .from('guests')
    .update({ linked_profile_id: null })
    .eq('id', guestId)

  if (error) return { error: error.message }

  revalidatePath('/admin/guests')
  revalidatePath(`/admin/guests/${guestId}`)
  revalidatePath('/house')
  return { ok: true }
}

/**
 * Permanently delete a guest record. Bed bookings that pointed at this
 * guest get their guest_id set to NULL (FK has ON DELETE SET NULL).
 * The free-text guest_name on those bookings stays as-is.
 *
 * Use sparingly — guest history is operational memory.
 */
export async function deleteGuest(
  guestId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  if (!guestId) return { error: 'Missing guest id' }

  const { error } = await supabase.from('guests').delete().eq('id', guestId)
  if (error) return { error: error.message }

  revalidatePath('/admin/guests')
  revalidatePath('/house')
  redirect('/admin/guests')
}

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

/**
 * Update the structured note fields on a profile. Admin-only.
 *
 * Form fields: dietary_notes, allergies, room_preference, things_they_bring,
 * general_notes — each optional. Empty strings are stored as NULL so
 * the UI's "no notes" check is reliable.
 *
 * RLS doesn't restrict columns (it's row-level). We rely on requireAdmin()
 * here as the gatekeeper. Non-admins simply won't reach this action
 * because the page that calls it is admin-gated server-side.
 */
export async function updateProfileNotes(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  const profileId = String(formData.get('profile_id') ?? '').trim()
  if (!profileId) return { error: 'Missing profile id' }

  // Read each field, trim, and convert empty to null
  function readField(name: string, max: number): string | null {
    const raw = String(formData.get(name) ?? '').trim()
    if (!raw) return null
    if (raw.length > max) {
      throw new Error(`${name.replace(/_/g, ' ')} is too long (max ${max} chars)`)
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
    .from('profiles')
    .update({
      dietary_notes: dietary,
      allergies,
      room_preference: roomPref,
      things_they_bring: thingsBring,
      general_notes: general,
    })
    .eq('id', profileId)

  if (error) return { error: error.message }

  revalidatePath('/admin/profiles')
  revalidatePath(`/admin/profiles/${profileId}`)
  // The booking panel may surface these notes — bust /house too.
  revalidatePath('/house')
  return { ok: true }
}

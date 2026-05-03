'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, requireProfile } from '@/lib/auth'

/**
 * Cleaner or admin records that they watered a plant.
 * Returns the new watering id so callers can support optimistic Undo.
 */
export async function recordPlantWatering(
  plantId: string,
): Promise<{ wateringId?: string; error?: string }> {
  const profile = await requireProfile()
  if (profile.role !== 'admin' && profile.role !== 'cleaner') {
    return { error: 'Only cleaners and admins can water plants' }
  }
  if (!plantId) return { error: 'Missing plant id' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plant_waterings')
    .insert({
      plant_id: plantId,
      watered_by: profile.id,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/housekeeping')
  return { wateringId: (data as any)?.id }
}

/**
 * Delete a watering record. The cleaner who recorded it can undo their
 * own; admin can undo any. RLS also enforces this.
 */
export async function undoPlantWatering(
  wateringId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireProfile()
  if (!wateringId) return { error: 'Missing watering id' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('plant_waterings')
    .delete()
    .eq('id', wateringId)

  if (error) return { error: error.message }
  revalidatePath('/housekeeping')
  return { ok: true }
}

// ─── Admin CRUD ──────────────────────────────────────────────────────

export async function createPlant(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  const name = String(formData.get('name') ?? '').trim()
  const location = String(formData.get('location') ?? '').trim() || null
  const frequencyRaw = String(formData.get('frequency_days') ?? '7').trim()
  const frequency = parseInt(frequencyRaw, 10)
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!name) return { error: 'Plant name is required' }
  if (name.length > 200) return { error: 'Name too long (max 200)' }
  if (Number.isNaN(frequency) || frequency < 1 || frequency > 365) {
    return { error: 'Watering frequency must be between 1 and 365 days' }
  }

  // Append at the bottom — pull current max position and add 1
  const { data: maxRow } = await supabase
    .from('plants')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPos = ((maxRow as any)?.position ?? 0) + 1

  const { error } = await supabase.from('plants').insert({
    name,
    location,
    frequency_days: frequency,
    notes,
    position: nextPos,
  })

  if (error) return { error: error.message }
  revalidatePath('/admin/plants')
  revalidatePath('/housekeeping')
  return { ok: true }
}

export async function updatePlant(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { error: 'Missing plant id' }

  const name = String(formData.get('name') ?? '').trim()
  const location = String(formData.get('location') ?? '').trim() || null
  const frequencyRaw = String(formData.get('frequency_days') ?? '').trim()
  const frequency = parseInt(frequencyRaw, 10)
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!name) return { error: 'Plant name is required' }
  if (name.length > 200) return { error: 'Name too long (max 200)' }
  if (Number.isNaN(frequency) || frequency < 1 || frequency > 365) {
    return { error: 'Watering frequency must be between 1 and 365 days' }
  }

  const { error } = await supabase
    .from('plants')
    .update({ name, location, frequency_days: frequency, notes })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/admin/plants')
  revalidatePath('/housekeeping')
  return { ok: true }
}

export async function deletePlant(
  plantId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  if (!plantId) return { error: 'Missing plant id' }
  const supabase = await createClient()
  // ON DELETE CASCADE wipes plant_waterings automatically
  const { error } = await supabase.from('plants').delete().eq('id', plantId)
  if (error) return { error: error.message }
  revalidatePath('/admin/plants')
  revalidatePath('/housekeeping')
  return { ok: true }
}

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'

/**
 * Records a completion for the given task template.
 * Returns { completionId } on success or { error } on failure.
 *
 * Returns instead of redirecting so the client can animate the row out
 * before navigating, and so the action can be called from useTransition().
 */
export async function markTaskComplete(
  taskTemplateId: string
): Promise<{ completionId?: string; error?: string }> {
  const profile = await requireProfile()

  if (profile.role !== 'admin' && profile.role !== 'cleaner') {
    return { error: 'Only cleaners and admins can mark tasks complete.' }
  }

  if (!taskTemplateId) {
    return { error: 'Missing task id' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('task_completions')
    .insert({
      task_template_id: taskTemplateId,
      completed_by: profile.id,
    })
    .select('id')
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/housekeeping')
  revalidatePath('/dashboard')
  return { completionId: (data as any)?.id }
}

/**
 * Deletes a completion (used by Undo). Only the user who created the
 * completion or an admin can delete it (enforced by RLS too).
 */
export async function undoTaskComplete(
  completionId: string
): Promise<{ ok?: true; error?: string }> {
  await requireProfile()

  if (!completionId) {
    return { error: 'Missing completion id' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('task_completions')
    .delete()
    .eq('id', completionId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/housekeeping')
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * Save the user's preferred room ordering.
 * Replaces all existing rows for this user, then inserts the new ordering.
 * (Used by the "Custom" sort mode when the user drags rooms around.)
 */
export async function saveRoomOrder(
  orderedRoomIds: string[]
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireProfile()
  const supabase = await createClient()

  // Wipe their existing ordering
  const { error: delErr } = await supabase
    .from('user_room_order')
    .delete()
    .eq('user_id', profile.id)
  if (delErr) return { error: delErr.message }

  if (orderedRoomIds.length === 0) {
    return { ok: true }
  }

  const rows = orderedRoomIds.map((roomId, idx) => ({
    user_id: profile.id,
    room_id: roomId,
    position: idx,
  }))

  const { error: insErr } = await supabase
    .from('user_room_order')
    .insert(rows)
  if (insErr) return { error: insErr.message }

  // No revalidatePath — the client component already reflects the new
  // order locally; the server fetch on the next visit will agree with it.
  return { ok: true }
}

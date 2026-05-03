'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, requireProfile } from '@/lib/auth'

/**
 * Admin posts an ad-hoc task ("clean garden table", "fix bathroom tap").
 *
 * Form fields:
 *   description    — required, 1-2000 chars
 *   room_id        — optional uuid; null/empty means general / no room
 *   priority       — 'normal' (default) or 'urgent'
 *
 * Returns the new task id so the caller can attach photos via the
 * existing /attachments uploader (kind='oneshot_task').
 */
export async function createOneshotTask(
  formData: FormData,
): Promise<{ ok?: true; task_id?: string; error?: string }> {
  const profile = await requireAdmin()
  const supabase = await createClient()

  const description = String(formData.get('description') ?? '').trim()
  const roomIdRaw = String(formData.get('room_id') ?? '').trim()
  const roomId = roomIdRaw || null
  const priorityRaw = String(formData.get('priority') ?? 'normal').trim()
  const priority = priorityRaw === 'urgent' ? 'urgent' : 'normal'

  if (!description) return { error: 'Please describe the task' }
  if (description.length > 2000) {
    return { error: 'Description is too long (max 2000 chars)' }
  }

  // If a room is given, sanity-check it exists. RLS would also block,
  // but a clean error message is nicer.
  if (roomId) {
    const { data: room } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', roomId)
      .maybeSingle()
    if (!room) return { error: 'That room no longer exists' }
  }

  const { data: row, error } = await supabase
    .from('oneshot_tasks')
    .insert({
      description,
      room_id: roomId,
      priority,
      created_by: profile.id,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !row) return { error: error?.message ?? 'Failed to create task' }

  revalidatePath('/housekeeping')
  return { ok: true, task_id: row.id }
}

/**
 * Cleaner (or admin) marks a one-shot task complete. Records who and when.
 */
export async function completeOneshotTask(
  taskId: string,
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireProfile()
  if (profile.role !== 'admin' && profile.role !== 'cleaner') {
    return { error: 'Only cleaners and admins can complete tasks' }
  }
  if (!taskId) return { error: 'Missing task id' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('oneshot_tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: profile.id,
    })
    .eq('id', taskId)
    .eq('status', 'pending') // idempotency — don't re-complete

  if (error) return { error: error.message }

  revalidatePath('/housekeeping')
  return { ok: true }
}

/**
 * Re-open a completed task (mistake or task wasn't actually done).
 * Admin or the cleaner who completed it can do this.
 */
export async function reopenOneshotTask(
  taskId: string,
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireProfile()
  if (profile.role !== 'admin' && profile.role !== 'cleaner') {
    return { error: 'Not allowed' }
  }
  if (!taskId) return { error: 'Missing task id' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('oneshot_tasks')
    .update({
      status: 'pending',
      completed_at: null,
      completed_by: null,
    })
    .eq('id', taskId)

  if (error) return { error: error.message }
  revalidatePath('/housekeeping')
  return { ok: true }
}

/**
 * Admin deletes a one-shot task entirely. Use sparingly — completed
 * tasks form a useful history.
 */
export async function deleteOneshotTask(
  taskId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  if (!taskId) return { error: 'Missing task id' }
  const supabase = await createClient()
  const { error } = await supabase.from('oneshot_tasks').delete().eq('id', taskId)
  if (error) return { error: error.message }
  revalidatePath('/housekeeping')
  return { ok: true }
}

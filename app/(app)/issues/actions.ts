'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireProfile, requireAdmin } from '@/lib/auth'

/**
 * Create a new issue. Admins or cleaners can call this.
 *
 * Form fields:
 *   description  — what's wrong (required, 1-2000 chars)
 *   room_id      — uuid (required)
 *
 * Returns { ok, issue_id } so the caller can chain a photo upload.
 */
export async function createIssue(
  formData: FormData
): Promise<{ ok?: true; issue_id?: string; error?: string }> {
  const profile = await requireProfile()
  if (profile.role !== 'admin' && profile.role !== 'cleaner') {
    return { error: 'Only cleaners and admins can report issues' }
  }
  const supabase = await createClient()

  const description = String(formData.get('description') ?? '').trim()
  const roomId = String(formData.get('room_id') ?? '')

  if (!description) return { error: 'Please describe the issue' }
  if (description.length > 2000) return { error: 'Description is too long (max 2000 chars)' }
  if (!roomId) return { error: 'Missing room' }

  const { data, error } = await supabase
    .from('issues')
    .insert({
      created_by: profile.id,
      room_id: roomId,
      description,
      status: 'open',
    })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message ?? 'Failed to create issue' }

  revalidatePath('/housekeeping')
  revalidatePath('/issues')
  revalidatePath(`/admin/rooms/${roomId}`)

  return { ok: true, issue_id: data.id }
}

/**
 * Mark an issue as resolved. Admin-only — RLS enforces too, this is a
 * belt-and-braces server check.
 */
export async function resolveIssue(
  issueId: string,
  resolutionNote?: string
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireAdmin()
  const supabase = await createClient()

  if (!issueId) return { error: 'Missing issue id' }

  const { error } = await supabase
    .from('issues')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: profile.id,
      resolution_note: resolutionNote?.trim() || null,
    })
    .eq('id', issueId)
    .eq('status', 'open') // idempotency — only resolve open issues

  if (error) return { error: error.message }

  revalidatePath('/housekeeping')
  revalidatePath('/issues')
  return { ok: true }
}

/**
 * Reopen a previously-resolved issue. Admin-only.
 */
export async function reopenIssue(
  issueId: string
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  if (!issueId) return { error: 'Missing issue id' }

  const { error } = await supabase
    .from('issues')
    .update({
      status: 'open',
      resolved_at: null,
      resolved_by: null,
      resolution_note: null,
    })
    .eq('id', issueId)
    .eq('status', 'resolved')

  if (error) return { error: error.message }

  revalidatePath('/housekeeping')
  revalidatePath('/issues')
  return { ok: true }
}

/**
 * Permanently delete an issue. Admin-only. Use sparingly — generally
 * resolveIssue is preferable for audit trail.
 */
export async function deleteIssue(
  issueId: string
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  if (!issueId) return { error: 'Missing issue id' }

  const { error } = await supabase.from('issues').delete().eq('id', issueId)

  if (error) return { error: error.message }

  revalidatePath('/housekeeping')
  revalidatePath('/issues')
  return { ok: true }
}

/**
 * Edit an issue's description (typo fixes). Either admin, or the cleaner
 * who created it (and only while still open). RLS enforces this strictly.
 */
export async function editIssueDescription(
  issueId: string,
  description: string
): Promise<{ ok?: true; error?: string }> {
  await requireProfile()
  const supabase = await createClient()

  const trimmed = description.trim()
  if (!trimmed) return { error: 'Description cannot be empty' }
  if (trimmed.length > 2000) return { error: 'Description is too long' }
  if (!issueId) return { error: 'Missing issue id' }

  const { error } = await supabase
    .from('issues')
    .update({ description: trimmed })
    .eq('id', issueId)

  if (error) return { error: error.message }

  revalidatePath('/housekeeping')
  revalidatePath('/issues')
  return { ok: true }
}

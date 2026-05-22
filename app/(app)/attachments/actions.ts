'use server'

import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type { AttachmentKind } from '@/lib/attachments'

/**
 * Upload an attachment via FormData.
 *
 * Form fields expected:
 *   file       — the File (single)
 *   kind       — AttachmentKind
 *   entity_id  — uuid of the parent entity
 *   caption    — optional one-liner (max 500 chars)
 *
 * Returns { ok, attachment_id } or { error }.
 *
 * Note: image downscale + EXIF rotation normalisation happens
 * client-side in the upload component before this action is called.
 * Server still enforces the 10MB hard limit.
 */
export async function uploadAttachment(
  formData: FormData
): Promise<{ ok?: true; attachment_id?: string; error?: string }> {
  const profile = await requireProfile()
  const supabase = await createClient()

  const file = formData.get('file')
  const kind = String(formData.get('kind') ?? '') as AttachmentKind
  const entityId = String(formData.get('entity_id') ?? '')
  const caption = String(formData.get('caption') ?? '').trim() || null

  if (!(file instanceof File)) return { error: 'Missing file' }
  if (!entityId) return { error: 'Missing entity_id' }

  const validKinds: AttachmentKind[] = [
    'issue', 'prearrival_check', 'booking', 'damage', 'general', 'room', 'oneshot_task',
  ]
  if (!validKinds.includes(kind)) return { error: 'Invalid kind' }

  // Server-side size guard (matches table CHECK constraint)
  if (file.size > 10 * 1024 * 1024) {
    return { error: 'File is larger than 10MB. Try a smaller photo.' }
  }
  if (file.size === 0) return { error: 'File is empty' }

  // Allow-list of MIME types we'll accept. Anything else gets rejected
  // server-side so a malicious client can't upload, e.g., text/html with
  // a .jpg extension and have it served back as HTML from storage (XSS).
  const allowedMimes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif',
    'application/pdf',
  ])
  const mime = (file.type || '').toLowerCase()
  if (!allowedMimes.has(mime)) {
    return {
      error: 'That file type is not allowed. Use JPG, PNG, WEBP, HEIC, GIF, or PDF.',
    }
  }

  // Build the storage path
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const safeExt = ext.replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
  const filename = `${crypto.randomUUID()}.${safeExt}`
  const storagePath = `${kind}/${entityId}/${filename}`

  // Upload to Storage — use validated MIME, not the raw client value.
  const { error: storageErr } = await supabase.storage
    .from('attachments')
    .upload(storagePath, file, {
      contentType: mime,
      upsert: false,
    })

  if (storageErr) {
    return { error: `Upload failed: ${storageErr.message}` }
  }

  // Insert the metadata row
  const { data: row, error: rowErr } = await supabase
    .from('attachments')
    .insert({
      created_by: profile.id,
      storage_path: storagePath,
      mime_type: mime,
      size_bytes: file.size,
      kind,
      entity_id: entityId,
      caption,
    })
    .select('id')
    .single()

  if (rowErr || !row) {
    // Roll back the storage upload — orphaned files cost money.
    await supabase.storage.from('attachments').remove([storagePath])
    return { error: rowErr?.message ?? 'Failed to record attachment' }
  }

  // Best-effort revalidation of pages likely to show this attachment
  revalidatePath('/house')
  revalidatePath('/housekeeping')

  return { ok: true, attachment_id: row.id }
}

/**
 * Delete an attachment by id. RLS gates this — uploader or admin only.
 * Removes both the storage object and the metadata row.
 */
export async function deleteAttachment(
  attachmentId: string
): Promise<{ ok?: true; error?: string }> {
  await requireProfile()
  const supabase = await createClient()

  if (!attachmentId) return { error: 'Missing attachment id' }

  // Fetch the row first so we know the storage path
  const { data: row, error: fetchErr } = await supabase
    .from('attachments')
    .select('id, storage_path')
    .eq('id', attachmentId)
    .single()

  if (fetchErr || !row) {
    return { error: fetchErr?.message ?? 'Attachment not found' }
  }

  // Remove storage object first (best-effort — if this fails, we still
  // try to delete the row to avoid dangling references)
  await supabase.storage.from('attachments').remove([row.storage_path])

  // Delete the metadata row (RLS will reject if not owner/admin)
  const { error: delErr } = await supabase
    .from('attachments')
    .delete()
    .eq('id', attachmentId)

  if (delErr) return { error: delErr.message }

  revalidatePath('/house')
  revalidatePath('/housekeeping')

  return { ok: true }
}

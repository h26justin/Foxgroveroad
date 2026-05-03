import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Polymorphic kind for attachments. Application layer is responsible for
 * sane (kind, entity_id) pairs — there's no FK enforcement on entity_id.
 */
export type AttachmentKind =
  | 'issue'
  | 'prearrival_check'
  | 'booking'
  | 'damage'
  | 'general'
  | 'room'
  | 'oneshot_task'

export type Attachment = {
  id: string
  created_at: string
  created_by: string | null
  storage_path: string
  mime_type: string
  size_bytes: number
  kind: AttachmentKind
  entity_id: string
  caption: string | null
}

/**
 * Attachment with a fresh signed URL ready to display.
 * Signed URLs expire after 1 hour — call listForEntity() again on
 * subsequent page loads to get fresh ones.
 */
export type AttachmentWithUrl = Attachment & {
  signed_url: string
}

const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour

/**
 * Fetch all attachments for a given (kind, entity_id) tuple, with fresh
 * signed URLs ready to display. Returned in newest-first order.
 *
 * RLS handles permissions — this function just calls the table; if the
 * user can't see an attachment it won't be in the result.
 */
export async function listAttachmentsForEntity(
  kind: AttachmentKind,
  entityId: string
): Promise<AttachmentWithUrl[]> {
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('attachments')
    .select('id, created_at, created_by, storage_path, mime_type, size_bytes, kind, entity_id, caption')
    .eq('kind', kind)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })

  if (error || !rows) return []

  // Sign each storage_path. createSignedUrls is one round-trip for many.
  const paths = rows.map((r) => r.storage_path)
  if (paths.length === 0) return []

  const { data: signed } = await supabase.storage
    .from('attachments')
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)

  if (!signed) return []

  // Map back. createSignedUrls returns in input order.
  return rows.map((r, i) => ({
    ...(r as Attachment),
    signed_url: signed[i]?.signedUrl ?? '',
  }))
}

/**
 * Fetch all attachments for many entities of the same kind in a single
 * round-trip. Used when rendering lists where each row may have photos.
 *
 * Returns a Map<entity_id, AttachmentWithUrl[]>.
 */
export async function listAttachmentsForEntities(
  kind: AttachmentKind,
  entityIds: string[]
): Promise<Map<string, AttachmentWithUrl[]>> {
  const result = new Map<string, AttachmentWithUrl[]>()
  if (entityIds.length === 0) return result

  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('attachments')
    .select('id, created_at, created_by, storage_path, mime_type, size_bytes, kind, entity_id, caption')
    .eq('kind', kind)
    .in('entity_id', entityIds)
    .order('created_at', { ascending: false })

  if (error || !rows || rows.length === 0) return result

  const paths = rows.map((r) => r.storage_path)
  const { data: signed } = await supabase.storage
    .from('attachments')
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)

  if (!signed) return result

  rows.forEach((r, i) => {
    const withUrl: AttachmentWithUrl = {
      ...(r as Attachment),
      signed_url: signed[i]?.signedUrl ?? '',
    }
    if (!result.has(r.entity_id)) result.set(r.entity_id, [])
    result.get(r.entity_id)!.push(withUrl)
  })

  return result
}

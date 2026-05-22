import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type ActiveAnnouncement = {
  id: string
  body: string
  dismissible: boolean
  created_at: string
}

/**
 * Returns the single most-recent active announcement that the given
 * user has NOT already dismissed, or null if there's nothing to show.
 *
 * Called from the authed layout — keep it fast. Two indexed lookups
 * by id; both rows are tiny.
 */
export async function getActiveAnnouncementFor(
  userId: string,
): Promise<ActiveAnnouncement | null> {
  const supabase = await createClient()

  const { data: ann } = await supabase
    .from('announcements')
    .select('id, body, dismissible, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!ann) return null

  // Has this user dismissed it?
  if ((ann as any).dismissible) {
    const { data: dismissal } = await supabase
      .from('announcement_dismissals')
      .select('announcement_id')
      .eq('announcement_id', (ann as any).id)
      .eq('user_id', userId)
      .maybeSingle()
    if (dismissal) return null
  }

  return ann as ActiveAnnouncement
}

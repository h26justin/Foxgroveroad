import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Append a row to the admin_audit log. Best-effort: never throws.
 * The audit log existing is more important than the caller knowing
 * about every insert failure — we log to console and move on.
 *
 * Use this for destructive or sensitive admin actions:
 *   - user.delete         user.email.update    user.role.update
 *   - user.ban.toggle     user.approve_pending
 *   - booking.approve     booking.decline      booking.cancel
 *   - booking.delete_permanently
 *   - announcement.create announcement.retire
 */
export async function logAdminAction(opts: {
  actorId: string
  action: string
  targetKind?: string | null
  targetId?: string | null
  payload?: Record<string, unknown>
}): Promise<void> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('admin_audit').insert({
      actor_id: opts.actorId,
      action: opts.action,
      target_kind: opts.targetKind ?? null,
      target_id: opts.targetId ?? null,
      payload: opts.payload ?? {},
    } as any)
    if (error) {
      console.warn('[audit] insert failed:', error.message)
    }
  } catch (err) {
    console.warn('[audit] insert threw:', err)
  }
}

import 'server-only'
// @ts-expect-error — web-push ships no types and we don't pull @types/web-push
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

let vapidConfigured = false
function ensureVapid(): boolean {
  if (vapidConfigured) return true
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:justin@jvhammond.com'
  if (!pub || !priv) {
    console.warn(
      '[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env vars not set; skipping push',
    )
    return false
  }
  webpush.setVapidDetails(subject, pub, priv)
  vapidConfigured = true
  return true
}

/**
 * Send a push notification to every subscribed device of every user
 * in `userIds`. Failures are logged but never thrown — callers should
 * never let a notification failure break the underlying flow (e.g.
 * creating the task should still succeed).
 *
 * Subscriptions that return 404/410 (gone, expired) are auto-deleted.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<void> {
  if (userIds.length === 0) return
  if (!ensureVapid()) return

  const supabase = createAdminClient()
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds)

  if (error) {
    console.error('[push] Failed to query subscriptions:', error.message)
    return
  }
  if (!subs || subs.length === 0) return

  const body = JSON.stringify(payload)

  await Promise.allSettled(
    subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body,
        )
      } catch (err: any) {
        const code = err?.statusCode
        if (code === 404 || code === 410) {
          // Subscription is gone — clean it up
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', s.id)
        } else {
          console.error(
            '[push] sendNotification failed:',
            code,
            err?.message ?? err,
          )
        }
      }
    }),
  )
}

/**
 * Get user IDs of all cleaners. Used when admin posts a task; we want
 * to notify cleaners but not the admin themselves.
 */
export async function getCleanerUserIds(): Promise<string[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'cleaner')
  if (error || !data) return []
  return data.map((p: any) => p.id as string)
}

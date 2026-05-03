'use server'

import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'

/**
 * Store a Web Push subscription for the current user. Idempotent:
 * the unique constraint on `endpoint` plus upsert means re-subscribing
 * the same device just refreshes the row.
 */
export async function subscribePush(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireProfile()
  const endpoint = String(formData.get('endpoint') ?? '').trim()
  const p256dh = String(formData.get('p256dh') ?? '').trim()
  const auth = String(formData.get('auth') ?? '').trim()
  const userAgent = String(formData.get('user_agent') ?? '').slice(0, 500)

  if (!endpoint || !p256dh || !auth) {
    return { error: 'Missing subscription data' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: profile.id,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent || null,
      },
      { onConflict: 'endpoint' },
    )
  if (error) return { error: error.message }
  return { ok: true }
}

/**
 * Remove a single push subscription (one device). Other devices for
 * the same user keep working.
 */
export async function unsubscribePush(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireProfile()
  const endpoint = String(formData.get('endpoint') ?? '').trim()
  if (!endpoint) return { error: 'Missing endpoint' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', profile.id)
  if (error) return { error: error.message }
  return { ok: true }
}

/**
 * Send a test notification to the calling user (all their devices).
 * Useful to verify the whole pipeline end-to-end after subscribing.
 */
export async function sendTestPush(): Promise<{
  ok?: true
  error?: string
  sent?: number
}> {
  const profile = await requireProfile()
  // Import inside the function so the client bundle never tries to
  // resolve `web-push` (it's a Node-only package).
  const { sendPushToUsers } = await import('@/lib/push')
  await sendPushToUsers([profile.id], {
    title: 'Foxgrove test',
    body: 'Push notifications are working!',
    url: '/',
    tag: 'test',
  })
  return { ok: true }
}

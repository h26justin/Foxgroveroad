import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUsers } from '@/lib/push'
import { sendEmail } from '@/lib/email'

/**
 * Send a notification to a set of users via BOTH web push (always) and
 * email (only if the user has opted in via Settings → Features → Email
 * me notifications).
 *
 * Use this as the default notification call site. The original
 * `sendPushToUsers` is still exported by lib/push.ts for places where
 * email mirroring isn't appropriate.
 *
 * Failures in either channel are logged and never thrown — callers
 * should never let a notification failure break the underlying flow
 * (e.g. creating a booking should still succeed).
 */
export async function notifyUsers(
  userIds: string[],
  payload: {
    title: string
    body: string
    /** Path appended to the site URL for both push action and email body link. */
    url?: string
    tag?: string
  },
): Promise<void> {
  if (userIds.length === 0) return

  // Push is fire-and-forget for both channels (so the caller doesn't
  // sit waiting on Resend).
  const pushPromise = sendPushToUsers(userIds, payload).catch((err) => {
    console.warn('[notify] push failed:', err)
  })

  // Email mirror — only for users who opted in.
  const emailPromise = (async () => {
    try {
      const admin = createAdminClient()

      const { data: prefs } = await admin
        .from('user_feature_prefs')
        .select('user_id')
        .in('user_id', userIds)
        .eq('email_notifications', true)

      const optedInIds = ((prefs as any[]) ?? []).map(
        (r) => r.user_id as string,
      )
      if (optedInIds.length === 0) return

      // Look up auth emails (one round-trip per user — auth.admin
      // doesn't take a list filter).
      const emails: string[] = []
      for (const uid of optedInIds) {
        try {
          const { data } = await admin.auth.admin.getUserById(uid)
          const email = data?.user?.email
          if (email) emails.push(email)
        } catch {
          // Skip users we can't resolve.
        }
      }
      if (emails.length === 0) return

      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        'https://foxgroveroad.vercel.app'
      const linkUrl = payload.url
        ? `${siteUrl.replace(/\/$/, '')}${payload.url.startsWith('/') ? payload.url : '/' + payload.url}`
        : siteUrl

      const subject = `[Foxgrove Road] ${payload.title}`
      const text = `${payload.body}\n\nOpen in app: ${linkUrl}\n\n— Foxgrove Road\nManage email preferences in Settings → Features.`
      const html = `
        <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 15px; color: #2a261f; line-height: 1.5;">
          <strong>${escapeHtml(payload.title)}</strong>
        </p>
        <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 14px; color: #2a261f; line-height: 1.5;">
          ${escapeHtml(payload.body)}
        </p>
        <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 14px;">
          <a href="${linkUrl}" style="color: #1e40af;">Open in app</a>
        </p>
        <hr style="border: none; border-top: 1px solid #ddd; margin-top: 24px;">
        <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 11px; color: #888;">
          — Foxgrove Road. Manage email preferences in Settings → Features.
        </p>
      `

      // Send each email individually — Resend allows up to 50 recipients
      // per call via `to`, but per-recipient personalisation needs separate
      // calls. With a single-house user count, the loop is fine.
      const results = await Promise.allSettled(
        emails.map((email) =>
          sendEmail({ to: email, subject, text, html }),
        ),
      )
      const failed = results.filter(
        (r) => r.status === 'rejected' || (r.value && !r.value.ok),
      )
      if (failed.length > 0) {
        console.warn(
          `[notify] ${failed.length}/${emails.length} email(s) failed`,
        )
      }
    } catch (err) {
      console.warn('[notify] email mirror failed:', err)
    }
  })()

  await Promise.allSettled([pushPromise, emailPromise])
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

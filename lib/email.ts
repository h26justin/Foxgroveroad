import 'server-only'

/**
 * Thin wrapper around Resend's REST API.
 *
 * Setup (user-side):
 *   1. Sign up at resend.com (free tier covers small family use easily).
 *   2. Verify a domain or use Resend's onboarding sender for testing.
 *   3. Set two env vars in Vercel (Production + Preview):
 *        RESEND_API_KEY=re_…
 *        RESEND_FROM_EMAIL=Foxgrove Road <noreply@your-domain.com>
 *   4. Restart the deployment. Calls to sendEmail() will start working.
 *
 * Until RESEND_API_KEY is set the function silently no-ops with a warn
 * log — safe to call from anywhere in the app.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export type SendEmailResult =
  | { ok: true }
  | { ok: false; error: string; skipped?: boolean }

export async function sendEmail(opts: {
  to: string | string[]
  subject: string
  text: string
  /** Optional HTML body — falls back to text-only if omitted. */
  html?: string
  /** Optional reply-to override (defaults to the From address). */
  replyTo?: string
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const fromAddr =
    process.env.RESEND_FROM_EMAIL ||
    'Foxgrove Road <onboarding@resend.dev>'

  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set; skipping email send')
    return {
      ok: false,
      skipped: true,
      error: 'RESEND_API_KEY not configured',
    }
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddr,
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
      // Don't let Resend stall a server action.
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const body = await res.text()
      return {
        ok: false,
        error: `Resend ${res.status}: ${body.slice(0, 200)}`,
      }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'fetch failed' }
  }
}

'use client'

import { useState } from 'react'
import { regenerateCalendarToken } from './actions'

type Props = {
  feedUrl: string | null
}

export default function CalendarFeedSection({ feedUrl }: Props) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleCopy() {
    if (!feedUrl) return
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API not available — fall back to a select-all hint
      const input = document.getElementById('calendar-feed-url') as
        | HTMLInputElement
        | null
      input?.select()
    }
  }

  async function handleRegenerate() {
    if (
      !confirm(
        'Rotate your calendar URL? Any calendar app subscribed to the current URL will stop syncing until you re-subscribe with the new URL.',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      // Server action redirects on success, so this rarely returns.
      await regenerateCalendarToken()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="fg-card p-6 space-y-4">
      <h2 className="fg-section-label" style={{ marginBottom: 0 }}>
        Calendar feed
      </h2>
      <p
        className="text-xs fg-mono"
        style={{ color: 'var(--color-muted)' }}
      >
        Subscribe to your approved Foxgrove bookings in Apple Calendar,
        Google Calendar, or Outlook. Add this URL as a new calendar
        subscription — the app will refresh it on its own schedule.
      </p>

      {feedUrl ? (
        <>
          <div className="flex gap-2 items-stretch">
            <input
              id="calendar-feed-url"
              type="text"
              readOnly
              value={feedUrl}
              className="fg-input flex-1 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              className="fg-btn-secondary whitespace-nowrap"
              onClick={handleCopy}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <details>
            <summary
              className="text-xs fg-mono cursor-pointer"
              style={{ color: 'var(--color-muted)' }}
            >
              Trouble? Rotate the URL
            </summary>
            <div className="mt-3 space-y-2">
              <p
                className="text-xs fg-mono"
                style={{ color: 'var(--color-muted)' }}
              >
                If this URL has leaked or you want a fresh one, you can
                generate a new one. The old URL stops working
                immediately.
              </p>
              <button
                type="button"
                className="fg-btn-secondary"
                disabled={busy}
                onClick={handleRegenerate}
              >
                {busy ? 'Rotating…' : 'Generate new URL'}
              </button>
            </div>
          </details>
        </>
      ) : (
        <p className="text-xs fg-mono" style={{ color: 'var(--color-muted)' }}>
          No calendar token yet — refresh in a moment.
        </p>
      )}
    </form>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { dismissAnnouncement } from './admin/announcements/actions'

type Props = {
  id: string
  body: string
  dismissible: boolean
}

export default function AnnouncementBanner({ id, body, dismissible }: Props) {
  const [hidden, setHidden] = useState(false)
  const [pending, startTransition] = useTransition()

  if (hidden) return null

  function onDismiss() {
    // Optimistic hide so the user gets immediate feedback even if the
    // round-trip to record the dismissal is slow.
    setHidden(true)
    startTransition(async () => {
      await dismissAnnouncement(id)
    })
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full"
      style={{
        background: 'var(--color-amber-bg, rgba(217, 119, 6, 0.10))',
        borderBottom: '1px solid rgba(217, 119, 6, 0.25)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-2 flex items-start gap-3 text-sm">
        <span aria-hidden style={{ fontSize: 16, lineHeight: '1.3em' }}>
          📣
        </span>
        <div className="flex-1" style={{ color: 'var(--color-ink)' }}>
          {body}
        </div>
        {dismissible && (
          <button
            type="button"
            onClick={onDismiss}
            disabled={pending}
            aria-label="Dismiss announcement"
            className="text-sm fg-mono"
            style={{
              color: 'var(--color-muted)',
              // v44: 44x44 tap target — was 16x20.
              minWidth: 44,
              minHeight: 44,
              padding: '10px 12px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect } from 'react'

/**
 * Single-purpose toast with optional Undo. Used by HousekeepingClient
 * (task-complete) and BookingPanel (guest-remove) — same pattern, same
 * styling.
 *
 * Auto-dismisses after `dismissAfterMs` (default 8s). onDismiss fires
 * either from the timer or from clicking Undo (the consumer is
 * responsible for clearing toast state after onUndo).
 */
export default function Toast({
  message,
  onUndo,
  onDismiss,
  dismissAfterMs = 8000,
}: {
  message: string
  onUndo?: () => void
  onDismiss: () => void
  dismissAfterMs?: number
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, dismissAfterMs)
    return () => clearTimeout(t)
  }, [onDismiss, dismissAfterMs])

  return (
    <div className="fg-toast" role="status" aria-live="polite">
      <span>{message}</span>
      {onUndo && (
        <button type="button" onClick={onUndo} className="fg-toast-undo">
          Undo
        </button>
      )}
    </div>
  )
}

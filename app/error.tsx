'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * Fallback for an unexpected error anywhere below the root layout.
 * Pages inside the app shell are caught first by app/(app)/error.tsx,
 * which keeps the nav; this one covers login, signup, arrival packets.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <ErrorCard digest={error.digest} onRetry={unstable_retry} />
    </main>
  )
}

export function ErrorCard({
  digest,
  onRetry,
}: {
  digest?: string
  onRetry: () => void
}) {
  return (
    <div className="fg-card p-6 max-w-md w-full text-center">
      <h1
        className="text-2xl mb-2"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
      >
        Something went wrong
      </h1>
      <p className="text-sm fg-mono mb-5" style={{ color: 'var(--color-muted)' }}>
        That page hit an error. Trying again usually fixes it — if it keeps
        happening, let an admin know
        {digest ? ` and quote reference ${digest}` : ''}.
      </p>
      <div className="flex gap-2 justify-center">
        <button
          type="button"
          onClick={() => onRetry()}
          className="fg-btn-gold"
          style={{ width: 'auto', padding: '8px 18px' }}
        >
          Try again
        </button>
        <Link href="/" className="fg-btn-ghost" style={{ width: 'auto', padding: '8px 18px' }}>
          Home
        </Link>
      </div>
    </div>
  )
}

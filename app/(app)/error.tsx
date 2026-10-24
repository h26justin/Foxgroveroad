'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import { ErrorCard } from '../error'

/**
 * Error fallback inside the authed shell — renders below the TopNav so
 * people can navigate away instead of being stuck on a blank page.
 */
export default function AppError({
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
    <div className="flex justify-center pt-10">
      <ErrorCard digest={error.digest} onRetry={unstable_retry} />
    </div>
  )
}

'use client' // Error boundaries must be Client Components

/**
 * Last-resort fallback when the root layout itself fails. Replaces the
 * whole document, so it can't rely on globals.css — styles are inline.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F4F3EF',
          color: '#1A1C26',
          fontFamily: 'system-ui, sans-serif',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <title>Something went wrong — Foxgrove Road</title>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#6B7191', fontSize: 14, marginBottom: 20 }}>
            The app couldn&apos;t load. Please try again in a moment
            {error.digest ? ` (reference ${error.digest})` : ''}.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              background: '#A8862E',
              color: 'white',
              border: 0,
              borderRadius: 10,
              padding: '10px 20px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}

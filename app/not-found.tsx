import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="fg-card p-6 max-w-md w-full text-center">
        <h1
          className="text-2xl mb-2"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
        >
          Page not found
        </h1>
        <p className="text-sm fg-mono mb-5" style={{ color: 'var(--color-muted)' }}>
          That link doesn&apos;t go anywhere — it may have expired or been
          typed wrong.
        </p>
        <Link href="/" className="fg-btn-gold" style={{ width: 'auto', padding: '8px 18px' }}>
          Go home
        </Link>
      </div>
    </main>
  )
}

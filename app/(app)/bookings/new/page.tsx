import Link from 'next/link'
import { requireProfile } from '@/lib/auth'
import { todayISO } from '@/lib/dates'
import RequestForm from './RequestForm'

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireProfile()
  const { error } = await searchParams

  const today = todayISO()
  // v45: UTC arithmetic so tomorrow doesn't return today in BST.
  const tomorrow = (() => {
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  })()

  return (
    <div className="max-w-xl">
      <div className="mb-8">
        <Link
          href="/bookings"
          className="text-sm fg-mono mb-2 inline-block"
          style={{ color: 'var(--color-muted)' }}
        >
          ← Back to bookings
        </Link>
        <h1
          className="text-3xl mb-2"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          Request a stay
        </h1>
        <p
          className="text-sm fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          Pick your dates and tell us about your group. We'll confirm the
          bedrooms once approved.
        </p>
      </div>

      {/* Availability hint */}
      <div
        className="fg-card mb-6 p-4 flex items-center justify-between gap-4"
        style={{ borderLeft: '4px solid var(--color-blue)' }}
      >
        <div className="text-sm" style={{ color: 'var(--color-ink)' }}>
          💡 Not sure when others are around? Check the house calendar first.
        </div>
        <Link
          href="/house"
          className="fg-btn-ghost text-sm shrink-0"
          style={{ color: 'var(--color-blue)' }}
        >
          See availability →
        </Link>
      </div>

      {error && <div className="fg-msg-error mb-6">{error}</div>}

      <RequestForm today={today} tomorrow={tomorrow} />
    </div>
  )
}

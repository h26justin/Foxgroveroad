import Link from 'next/link'
import { requireProfile } from '@/lib/auth'
import { todayISO } from '@/lib/dates'
import { createBookingRequest } from './actions'

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireProfile()
  const { error } = await searchParams

  // Default check-in to today, check-out to tomorrow (a sensible starting state)
  const today = todayISO()
  const tomorrow = (() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() + 1)
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
          Pick your dates and group size. We'll confirm the bedrooms once approved.
        </p>
      </div>

      {error && <div className="fg-msg-error mb-6">{error}</div>}

      <form action={createBookingRequest} className="space-y-6 fg-card p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="check_in" className="fg-label">
              Check-in
            </label>
            <input
              id="check_in"
              name="check_in"
              type="date"
              required
              min={today}
              defaultValue={today}
              className="fg-input"
            />
          </div>
          <div>
            <label htmlFor="check_out" className="fg-label">
              Check-out
            </label>
            <input
              id="check_out"
              name="check_out"
              type="date"
              required
              min={tomorrow}
              defaultValue={tomorrow}
              className="fg-input"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="adults" className="fg-label">
              Adults
            </label>
            <input
              id="adults"
              name="adults"
              type="number"
              required
              min={1}
              max={20}
              defaultValue={2}
              className="fg-input"
            />
          </div>
          <div>
            <label htmlFor="children" className="fg-label">
              Children
            </label>
            <input
              id="children"
              name="children"
              type="number"
              required
              min={0}
              max={20}
              defaultValue={0}
              className="fg-input"
            />
          </div>
        </div>

        <div>
          <label htmlFor="notes" className="fg-label">
            Notes <span style={{ color: 'var(--color-muted)' }}>(optional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Anything we should know? Anniversary trip, kids prefer ground floor, etc."
            className="fg-input"
            maxLength={500}
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="fg-btn-primary">
            Submit request
          </button>
          <Link href="/bookings" className="fg-btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}

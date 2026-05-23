import {
  formatBinDate,
  binIconFor,
  type UpcomingGroup,
  type BinReminder,
} from '@/lib/bin-collections'

/**
 * Compact upcoming-collections card shown on the dashboard.
 *
 * - If there's a reminder for today (put_out / today / bring_in), it's
 *   shown as an actionable banner at the top of the card.
 * - Below that: the next 3 collection dates.
 */
export default function BinSection({
  upcoming,
  reminder,
  hasError,
  notConfigured,
}: {
  upcoming: UpcomingGroup[]
  reminder: BinReminder | null
  hasError: boolean
  notConfigured: boolean
}) {
  if (notConfigured) {
    return (
      <section className="fg-card p-5">
        <h2 className="fg-section-label mb-2">Bin collections</h2>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          Set up by entering your council iCal URL in{' '}
          <a
            href="/admin/house-info"
            className="underline"
            style={{ color: 'var(--color-ink)' }}
          >
            House info
          </a>
          .
        </p>
      </section>
    )
  }

  if (upcoming.length === 0 && !reminder) {
    return (
      <section className="fg-card p-5">
        <h2 className="fg-section-label mb-2">Bin collections</h2>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          {hasError
            ? "Couldn't reach the council site this time — we'll retry on the next dashboard load."
            : 'No upcoming collections in the feed.'}
        </p>
      </section>
    )
  }

  return (
    <section className="fg-card p-5">
      <h2 className="fg-section-label mb-3">Bin collections</h2>

      {reminder && <ReminderBanner reminder={reminder} />}

      {upcoming.length > 0 && (
        <ul className="mt-3 space-y-2">
          {upcoming.map((g) => (
            <li
              key={g.date}
              className="flex items-baseline justify-between gap-3 flex-wrap"
              style={{
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                paddingBottom: 6,
              }}
            >
              <span
                className="text-sm shrink-0"
                style={{
                  color: 'var(--color-ink)',
                  fontFamily: 'var(--font-serif)',
                }}
              >
                {formatBinDate(g.date)}
              </span>
              <span
                className="text-xs text-right flex items-center gap-3 flex-wrap justify-end"
                style={{ color: 'var(--color-ink)' }}
              >
                {g.services.map((svc) => (
                  <span
                    key={svc}
                    className="inline-flex items-center gap-1"
                    title={svc}
                  >
                    <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
                      {binIconFor(svc)}
                    </span>
                    <span className="fg-mono">{svc}</span>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ReminderBanner({ reminder }: { reminder: BinReminder }) {
  const palette =
    reminder.kind === 'put_out'
      ? { bg: 'rgba(217,119,6,0.10)', border: '#d97706', icon: '🌙' }
      : reminder.kind === 'today'
        ? { bg: 'rgba(22,163,74,0.10)', border: '#16a34a', icon: '🚛' }
        : { bg: 'rgba(59,130,246,0.10)', border: '#3b82f6', icon: '🏠' }

  const headline =
    reminder.kind === 'put_out'
      ? `Tonight: put the bins out for tomorrow's collection`
      : reminder.kind === 'today'
        ? `Today: bins are being collected`
        : `Today: bring the bins back in`

  return (
    <div
      role="status"
      className="rounded p-3 text-sm"
      style={{
        background: palette.bg,
        borderLeft: `4px solid ${palette.border}`,
      }}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden style={{ fontSize: 18, lineHeight: '1.3em' }}>
          {palette.icon}
        </span>
        <div className="flex-1">
          <div style={{ color: 'var(--color-ink)', fontWeight: 600 }}>
            {headline}
          </div>
          <div
            className="text-xs mt-1 flex items-center gap-3 flex-wrap"
            style={{ color: 'var(--color-muted)' }}
          >
            <span className="fg-mono">{formatBinDate(reminder.collectionDate)}</span>
            {reminder.services.map((svc) => (
              <span key={svc} className="inline-flex items-center gap-1" title={svc}>
                <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
                  {binIconFor(svc)}
                </span>
                <span className="fg-mono">{svc}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

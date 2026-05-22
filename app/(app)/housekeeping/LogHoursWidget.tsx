'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { logMyHours, deleteMyHourLog } from './log-hours-actions'

type LogRow = {
  id: string
  date: string
  hours: number
  notes: string | null
}

export default function LogHoursWidget({
  cleanerName,
  recentLogs,
  weekTotal,
  today,
}: {
  cleanerName: string
  recentLogs: LogRow[]
  weekTotal: number
  today: string
}) {
  const router = useRouter()
  const [date, setDate] = useState(today)
  const [hours, setHours] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (!hours) {
      setError('Enter your hours')
      return
    }
    setError(null)
    setFeedback(null)
    const fd = new FormData()
    fd.set('date', date)
    fd.set('hours', hours)
    if (notes) fd.set('notes', notes)
    startTransition(async () => {
      const r = await logMyHours(fd)
      if (r.error) {
        setError(r.error)
        return
      }
      setHours('')
      setNotes('')
      setFeedback('Saved.')
      router.refresh()
    })
  }

  function remove(id: string) {
    if (!confirm('Remove this entry?')) return
    startTransition(async () => {
      const r = await deleteMyHourLog(id)
      if (r.error) {
        setError(r.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="fg-card p-5 mb-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="fg-section-label" style={{ marginBottom: 0 }}>
          Log my hours
        </h2>
        <div
          className="text-xs fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          This week: <strong>{weekTotal.toFixed(2)} h</strong>
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
        <div>
          <label htmlFor="lh-date" className="fg-label">
            Date
          </label>
          <input
            id="lh-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="fg-input"
            style={{ minWidth: 140 }}
          />
        </div>
        <div>
          <label htmlFor="lh-notes" className="fg-label">
            Notes (optional)
          </label>
          <input
            id="lh-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What you worked on…"
            className="fg-input"
            maxLength={200}
          />
        </div>
        <div>
          <label htmlFor="lh-hours" className="fg-label">
            Hours
          </label>
          <input
            id="lh-hours"
            type="number"
            step={0.25}
            min={0.25}
            max={24}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="3.5"
            className="fg-input"
            style={{ width: 80 }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="fg-btn-primary"
          style={{ width: 'auto', padding: '8px 18px', fontSize: 14 }}
        >
          {busy ? 'Saving…' : 'Save hours'}
        </button>
        {feedback && (
          <span
            className="text-xs fg-mono"
            style={{ color: 'var(--color-green)' }}
          >
            {feedback}
          </span>
        )}
        {error && <span className="fg-msg-error">{error}</span>}
      </div>

      {recentLogs.length > 0 && (
        <details className="mt-4">
          <summary
            className="text-xs fg-mono cursor-pointer"
            style={{ color: 'var(--color-muted)' }}
          >
            Recent entries ({recentLogs.length})
          </summary>
          <div className="mt-2 space-y-1">
            {recentLogs.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between text-sm py-1"
                style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}
              >
                <span style={{ color: 'var(--color-muted)', minWidth: 90 }}>
                  {l.date}
                </span>
                <span
                  className="flex-1 mx-2 truncate"
                  style={{ color: 'var(--color-ink)' }}
                >
                  {l.hours}h{l.notes ? ` — ${l.notes}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => remove(l.id)}
                  aria-label="Remove entry"
                  className="text-xs fg-mono"
                  style={{
                    color: 'var(--color-red)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 6px',
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {cleanerName && (
        <p
          className="text-xs fg-mono mt-3"
          style={{ color: 'var(--color-muted)' }}
        >
          Logged as <strong>{cleanerName}</strong>.
        </p>
      )}
    </section>
  )
}

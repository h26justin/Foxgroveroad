'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { submitWeekHours, updatePayRates, deleteWeekHours } from './actions'

type Rates = {
  linda_hourly: number
  sam_hourly: number
  linda_bonus_per_sam_hour: number
  updated_at: string | null
}

type Week = {
  id: string
  week_start_date: string
  linda_hours: number
  sam_hours: number
  linda_hourly_at_submit: number
  sam_hourly_at_submit: number
  linda_bonus_per_sam_hour_at_submit: number
  notes: string | null
  submitted_at: string
  submitter_name: string
}

/**
 * Find the most recent Monday on or before today, in YYYY-MM-DD form.
 */
function mostRecentMondayISO(): string {
  const d = new Date()
  // JS getDay: 0=Sun, 1=Mon, ... 6=Sat. We want to step back to Monday.
  const day = d.getDay()
  const daysSinceMon = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - daysSinceMon)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

/**
 * Format a YYYY-MM-DD into "Mon 28 Apr 2026 → Sun 4 May 2026".
 */
function formatWeekRange(monIso: string): string {
  const mon = new Date(monIso + 'T00:00:00')
  const sun = new Date(mon)
  sun.setDate(sun.getDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  return `${fmt(mon)} → ${fmt(sun)}`
}

function formatGBP(amount: number): string {
  return `£${amount.toFixed(2)}`
}

/**
 * Compute pay for a (lindaHours, samHours, rates) tuple. Pure function
 * — used both at-submit time and for live preview.
 */
function computePay(
  lindaHours: number,
  samHours: number,
  rates: { linda_hourly: number; sam_hourly: number; linda_bonus_per_sam_hour: number }
) {
  const lindaBase = lindaHours * rates.linda_hourly
  const lindaBonus = samHours * rates.linda_bonus_per_sam_hour
  const lindaPay = lindaBase + lindaBonus
  const samPay = samHours * rates.sam_hourly
  const total = lindaPay + samPay
  return { lindaBase, lindaBonus, lindaPay, samPay, total }
}

export default function PayClient({
  currentRates,
  weeks,
}: {
  currentRates: Rates
  weeks: Week[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Form state for new/edit week
  const [weekStart, setWeekStart] = useState(mostRecentMondayISO())
  const [lindaHoursStr, setLindaHoursStr] = useState('')
  const [samHoursStr, setSamHoursStr] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [logSuccess, setLogSuccess] = useState<string | null>(null)

  // Rates editor (collapsed by default)
  const [editingRates, setEditingRates] = useState(false)
  const [rateLinda, setRateLinda] = useState(String(currentRates.linda_hourly))
  const [rateSam, setRateSam] = useState(String(currentRates.sam_hourly))
  const [rateBonus, setRateBonus] = useState(
    String(currentRates.linda_bonus_per_sam_hour)
  )
  const [ratesError, setRatesError] = useState<string | null>(null)

  // Live preview of pay as you type
  const livePreview = useMemo(() => {
    const lh = Number(lindaHoursStr) || 0
    const sh = Number(samHoursStr) || 0
    return computePay(lh, sh, currentRates)
  }, [lindaHoursStr, samHoursStr, currentRates])

  // Total spend across all logged weeks (using snapshot rates)
  const totalLogged = useMemo(() => {
    return weeks.reduce(
      (acc, w) => {
        const p = computePay(w.linda_hours, w.sam_hours, {
          linda_hourly: w.linda_hourly_at_submit,
          sam_hourly: w.sam_hourly_at_submit,
          linda_bonus_per_sam_hour: w.linda_bonus_per_sam_hour_at_submit,
        })
        acc.linda += p.lindaPay
        acc.sam += p.samPay
        acc.total += p.total
        acc.lindaHours += w.linda_hours
        acc.samHours += w.sam_hours
        return acc
      },
      { linda: 0, sam: 0, total: 0, lindaHours: 0, samHours: 0 }
    )
  }, [weeks])

  // Did user pick a week that's already been logged? (so we know to say "edit" not "submit")
  const existingForWeek = useMemo(
    () => weeks.find((w) => w.week_start_date === weekStart),
    [weeks, weekStart]
  )

  // Quick week-shifting buttons
  function shiftWeek(deltaWeeks: number) {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + deltaWeeks * 7)
    setWeekStart(d.toISOString().slice(0, 10))
  }

  function loadFromExisting() {
    if (!existingForWeek) return
    setLindaHoursStr(String(existingForWeek.linda_hours))
    setSamHoursStr(String(existingForWeek.sam_hours))
    setNotes(existingForWeek.notes ?? '')
  }

  async function handleSubmit() {
    setLogError(null)
    setLogSuccess(null)

    // Validate as Monday on the client too — friendlier than server bounce
    const d = new Date(weekStart + 'T00:00:00')
    if (Number.isNaN(d.getTime()) || d.getDay() !== 1) {
      setLogError('Pick a Monday for the week start date')
      return
    }
    const lh = Number(lindaHoursStr)
    const sh = Number(samHoursStr)
    if (!Number.isFinite(lh) || lh < 0) {
      setLogError("Linda's hours must be a non-negative number")
      return
    }
    if (!Number.isFinite(sh) || sh < 0) {
      setLogError("Sam's hours must be a non-negative number")
      return
    }

    setBusy(true)
    const fd = new FormData()
    fd.append('week_start_date', weekStart)
    fd.append('linda_hours', String(lh))
    fd.append('sam_hours', String(sh))
    if (notes) fd.append('notes', notes)
    const result = await submitWeekHours(fd)
    setBusy(false)
    if (result.error) {
      setLogError(result.error)
      return
    }
    setLogSuccess(
      existingForWeek
        ? 'Week updated.'
        : 'Week logged. Pay calculated.'
    )
    setLindaHoursStr('')
    setSamHoursStr('')
    setNotes('')
    startTransition(() => router.refresh())
  }

  async function handleSaveRates() {
    setRatesError(null)
    const fd = new FormData()
    fd.append('linda_hourly', rateLinda)
    fd.append('sam_hourly', rateSam)
    fd.append('linda_bonus_per_sam_hour', rateBonus)
    setBusy(true)
    const result = await updatePayRates(fd)
    setBusy(false)
    if (result.error) {
      setRatesError(result.error)
      return
    }
    setEditingRates(false)
    startTransition(() => router.refresh())
  }

  async function handleDeleteWeek(week: Week) {
    if (
      !confirm(
        `Delete the hours logged for ${formatWeekRange(week.week_start_date)}? This cannot be undone.`
      )
    )
      return
    setBusy(true)
    const result = await deleteWeekHours(week.week_start_date)
    setBusy(false)
    if (result.error) {
      alert(result.error)
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-3xl mb-1"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
        >
          Pay
        </h1>
        <p
          className="text-sm fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          Log cleaner hours each week and track total spend.
        </p>
      </div>

      {/* Current rates summary + edit */}
      <section className="fg-card p-4 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="fg-section-label" style={{ marginBottom: 0 }}>
            Current rates
          </h2>
          {!editingRates && (
            <button
              type="button"
              onClick={() => setEditingRates(true)}
              className="fg-btn-ghost text-xs"
              style={{ width: 'auto', padding: '6px 12px' }}
            >
              Edit rates
            </button>
          )}
        </div>

        {!editingRates ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <RateDisplay label="Linda hourly" value={`£${currentRates.linda_hourly}/hr`} />
            <RateDisplay label="Sam hourly"   value={`£${currentRates.sam_hourly}/hr`} />
            <RateDisplay
              label="Linda bonus per Sam-hour"
              value={`£${currentRates.linda_bonus_per_sam_hour}/hr`}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="fg-label">Linda hourly (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rateLinda}
                  onChange={(e) => setRateLinda(e.target.value)}
                  className="fg-input"
                />
              </div>
              <div>
                <label className="fg-label">Sam hourly (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rateSam}
                  onChange={(e) => setRateSam(e.target.value)}
                  className="fg-input"
                />
              </div>
              <div>
                <label className="fg-label">Linda bonus per Sam-hour (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rateBonus}
                  onChange={(e) => setRateBonus(e.target.value)}
                  className="fg-input"
                />
              </div>
            </div>
            {ratesError && <div className="fg-msg-error">{ratesError}</div>}
            <p className="text-xs fg-mono" style={{ color: 'var(--color-muted)' }}>
              Past weeks keep their original rates. Only future submissions
              use the new ones.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveRates}
                disabled={busy}
                className="fg-btn-gold"
                style={{ width: 'auto', padding: '8px 18px' }}
              >
                {busy ? 'Saving…' : 'Save rates'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingRates(false)
                  setRateLinda(String(currentRates.linda_hourly))
                  setRateSam(String(currentRates.sam_hourly))
                  setRateBonus(String(currentRates.linda_bonus_per_sam_hour))
                  setRatesError(null)
                }}
                disabled={busy}
                className="fg-btn-ghost"
                style={{ width: 'auto', padding: '8px 14px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Log a week */}
      <section className="fg-card p-4 mb-6">
        <h2 className="fg-section-label mb-3">
          {existingForWeek ? 'Edit week' : 'Log a week'}
        </h2>

        {/* v43: one-line summary of the rates the hours below will be
            multiplied by. Saves admin from having to open the rates
            editor just to check what's current. */}
        <div
          className="mb-4 text-xs flex items-baseline gap-2 flex-wrap"
          style={{
            color: 'var(--color-muted)',
            padding: '8px 10px',
            background: 'var(--color-cream)',
            borderRadius: 6,
            border: '1px solid var(--color-warm)',
          }}
        >
          <span className="fg-mono">Rates:</span>
          <span style={{ color: 'var(--color-ink)' }}>
            Linda {formatGBP(currentRates.linda_hourly)}/h
          </span>
          <span aria-hidden>·</span>
          <span style={{ color: 'var(--color-ink)' }}>
            Sam {formatGBP(currentRates.sam_hourly)}/h
          </span>
          <span aria-hidden>·</span>
          <span style={{ color: 'var(--color-ink)' }}>
            +{formatGBP(currentRates.linda_bonus_per_sam_hour)}/h Linda bonus per Sam-hour
          </span>
          <button
            type="button"
            onClick={() => setEditingRates(!editingRates)}
            className="fg-btn-ghost text-xs"
            style={{
              width: 'auto',
              padding: '2px 8px',
              marginLeft: 'auto',
            }}
          >
            {editingRates ? 'Hide rates' : 'Edit rates'}
          </button>
        </div>

        {/* Week selector */}
        <div className="mb-4">
          <label className="fg-label">Week starting (Monday)</label>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => shiftWeek(-1)}
              className="fg-btn-ghost text-xs"
              style={{ width: 'auto', padding: '8px 10px' }}
              aria-label="Previous week"
            >
              ‹
            </button>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="fg-input"
              style={{ flex: '0 0 auto', width: 170 }}
            />
            <button
              type="button"
              onClick={() => shiftWeek(1)}
              className="fg-btn-ghost text-xs"
              style={{ width: 'auto', padding: '8px 10px' }}
              aria-label="Next week"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(mostRecentMondayISO())}
              className="fg-btn-ghost text-xs"
              style={{ width: 'auto', padding: '8px 12px' }}
            >
              This week
            </button>
          </div>
          <div
            className="text-xs fg-mono mt-1"
            style={{ color: 'var(--color-muted)' }}
          >
            {formatWeekRange(weekStart)}
          </div>
          {existingForWeek && (
            <div
              className="text-xs fg-mono mt-2"
              style={{ color: 'var(--color-amber)' }}
            >
              ⚠ This week already has hours logged.{' '}
              <button
                type="button"
                onClick={loadFromExisting}
                className="underline"
                style={{ color: 'var(--color-blue)' }}
              >
                Load existing values
              </button>
              , then submitting will overwrite.
            </div>
          )}
        </div>

        {/* Hours inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="fg-label">Linda's hours</label>
            <input
              type="number"
              step="0.25"
              min="0"
              max="168"
              value={lindaHoursStr}
              onChange={(e) => setLindaHoursStr(e.target.value)}
              className="fg-input"
              placeholder="e.g. 22"
            />
          </div>
          <div>
            <label className="fg-label">Sam's hours</label>
            <input
              type="number"
              step="0.25"
              min="0"
              max="168"
              value={samHoursStr}
              onChange={(e) => setSamHoursStr(e.target.value)}
              className="fg-input"
              placeholder="e.g. 18"
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="fg-label">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="fg-input"
            placeholder="e.g. Sam was off Wednesday"
            maxLength={1000}
          />
        </div>

        {/* Live pay preview */}
        {(Number(lindaHoursStr) > 0 || Number(samHoursStr) > 0) && (
          <div
            className="fg-card p-3 mb-3"
            style={{
              background: 'rgba(168, 134, 46, 0.06)',
              borderColor: 'rgba(168, 134, 46, 0.25)',
            }}
          >
            <div
              className="text-xs fg-mono mb-2"
              style={{ color: 'var(--color-muted)' }}
            >
              ESTIMATED PAY
            </div>
            <div className="space-y-1 text-sm">
              <PayLine
                label={`Linda — ${Number(lindaHoursStr) || 0} hrs × £${currentRates.linda_hourly}`}
                value={formatGBP(livePreview.lindaBase)}
              />
              {livePreview.lindaBonus > 0 && (
                <PayLine
                  label={`Linda — bonus (${Number(samHoursStr) || 0} × £${currentRates.linda_bonus_per_sam_hour})`}
                  value={formatGBP(livePreview.lindaBonus)}
                />
              )}
              <PayLine
                label={`Sam — ${Number(samHoursStr) || 0} hrs × £${currentRates.sam_hourly}`}
                value={formatGBP(livePreview.samPay)}
              />
              <div
                style={{ borderTop: '1px solid var(--color-warm)', marginTop: 6, paddingTop: 6 }}
              >
                <PayLine label="Linda total" value={formatGBP(livePreview.lindaPay)} bold />
                <PayLine label="Sam total"   value={formatGBP(livePreview.samPay)} bold />
                <PayLine
                  label="Week total"
                  value={formatGBP(livePreview.total)}
                  bold
                  emphasis
                />
              </div>
            </div>
          </div>
        )}

        {logError && <div className="fg-msg-error mb-3">{logError}</div>}
        {logSuccess && <div className="fg-msg-success mb-3">{logSuccess}</div>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className="fg-btn-gold"
          style={{ width: 'auto', padding: '8px 18px' }}
        >
          {busy
            ? 'Saving…'
            : existingForWeek
              ? 'Overwrite week'
              : 'Log week'}
        </button>
      </section>

      {/* Totals */}
      {weeks.length > 0 && (
        <section
          className="fg-card p-4 mb-6"
          style={{ background: 'var(--color-card)' }}
        >
          <h2 className="fg-section-label mb-3">Total to date</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <RateDisplay
              label={`Linda (${totalLogged.lindaHours.toFixed(2)} hrs)`}
              value={formatGBP(totalLogged.linda)}
            />
            <RateDisplay
              label={`Sam (${totalLogged.samHours.toFixed(2)} hrs)`}
              value={formatGBP(totalLogged.sam)}
            />
            <RateDisplay
              label={`${weeks.length} week${weeks.length === 1 ? '' : 's'} total`}
              value={formatGBP(totalLogged.total)}
            />
          </div>
        </section>
      )}

      {/* Past weeks */}
      <section>
        <h2 className="fg-section-label mb-3">Logged weeks</h2>
        {weeks.length === 0 ? (
          <div className="fg-card p-8 text-center">
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              No weeks logged yet. Use the form above.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {weeks.map((w) => {
              const pay = computePay(w.linda_hours, w.sam_hours, {
                linda_hourly: w.linda_hourly_at_submit,
                sam_hourly: w.sam_hourly_at_submit,
                linda_bonus_per_sam_hour: w.linda_bonus_per_sam_hour_at_submit,
              })
              return (
                <div key={w.id} className="fg-card p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-base"
                        style={{
                          fontFamily: 'var(--font-serif)',
                          color: 'var(--color-ink)',
                        }}
                      >
                        {formatWeekRange(w.week_start_date)}
                      </div>
                      <div
                        className="text-xs fg-mono mt-1"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        Linda {w.linda_hours} hrs · Sam {w.sam_hours} hrs ·
                        rates £{w.linda_hourly_at_submit}/£
                        {w.sam_hourly_at_submit}/£
                        {w.linda_bonus_per_sam_hour_at_submit} ·
                        logged by {w.submitter_name}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="text-lg"
                        style={{
                          fontFamily: 'var(--font-serif)',
                          color: 'var(--color-ink)',
                        }}
                      >
                        {formatGBP(pay.total)}
                      </div>
                      <div
                        className="text-xs fg-mono"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        L {formatGBP(pay.lindaPay)} · S{' '}
                        {formatGBP(pay.samPay)}
                      </div>
                    </div>
                  </div>
                  {w.notes && (
                    <div
                      className="text-xs px-3 py-2 mt-2 rounded"
                      style={{
                        background: 'var(--color-cream)',
                        color: 'var(--color-ink)',
                      }}
                    >
                      💬 {w.notes}
                    </div>
                  )}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setWeekStart(w.week_start_date)
                        setLindaHoursStr(String(w.linda_hours))
                        setSamHoursStr(String(w.sam_hours))
                        setNotes(w.notes ?? '')
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                      className="fg-btn-ghost text-xs"
                      style={{ width: 'auto', padding: '6px 12px' }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteWeek(w)}
                      className="fg-btn-ghost text-xs"
                      style={{
                        width: 'auto',
                        padding: '6px 12px',
                        color: 'var(--color-red)',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function RateDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-xs fg-mono"
        style={{ color: 'var(--color-muted)' }}
      >
        {label}
      </div>
      <div
        className="text-xl"
        style={{
          fontFamily: 'var(--font-serif)',
          color: 'var(--color-ink)',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function PayLine({
  label,
  value,
  bold,
  emphasis,
}: {
  label: string
  value: string
  bold?: boolean
  emphasis?: boolean
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-2"
      style={{
        fontWeight: bold ? 600 : 400,
        color: emphasis ? 'var(--color-gold)' : 'var(--color-ink)',
      }}
    >
      <span
        className="text-xs fg-mono"
        style={{ color: emphasis ? 'var(--color-gold)' : 'var(--color-muted)' }}
      >
        {label}
      </span>
      <span style={{ fontFamily: emphasis ? 'var(--font-serif)' : 'inherit' }}>
        {value}
      </span>
    </div>
  )
}

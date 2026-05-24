'use client'

import { useEffect, useState } from 'react'
import { createBookingRequest } from './actions'
import { checkAvailability, type AvailabilityResult } from './availability'

type AgeBand = 'infant' | 'toddler' | 'child'
type SleepArrangement = 'cot' | 'own_bed' | 'sharing_with_parent'

type ChildRow = {
  // Local UI ID — not persisted. The server creates the real UUIDs.
  uiId: string
  age_band: AgeBand
  sleep_arrangement: SleepArrangement
}

const AGE_BANDS: { value: AgeBand; label: string; hint: string }[] = [
  { value: 'infant',  label: 'Infant',  hint: 'under ~18 months — needs a cot' },
  { value: 'toddler', label: 'Toddler', hint: '~18 months to 3 years' },
  { value: 'child',   label: 'Child',   hint: '3+ years — own bed or sharing' },
]

// Allowed sleeping arrangements per age band
const ALLOWED_ARRANGEMENTS: Record<AgeBand, SleepArrangement[]> = {
  infant:  ['cot'],
  toddler: ['cot', 'own_bed'],
  child:   ['own_bed', 'sharing_with_parent'],
}

const ARRANGEMENT_LABELS: Record<SleepArrangement, string> = {
  cot:                  'Cot (you bring)',
  own_bed:              'Own bed',
  sharing_with_parent:  'Sharing with parent',
}

function defaultArrangementFor(age: AgeBand): SleepArrangement {
  return ALLOWED_ARRANGEMENTS[age][0]
}

function makeUiId() {
  return Math.random().toString(36).slice(2, 9)
}

export default function RequestForm({
  today,
  tomorrow,
}: {
  today: string
  tomorrow: string
}) {
  const [adultsSharing, setAdultsSharing] = useState<'sharing' | 'separate' | 'solo'>('sharing')
  const [children, setChildren] = useState<ChildRow[]>([])

  // Adults count is implied by the sharing choice for the simple cases,
  // but we keep an explicit number so larger groups still work.
  const [adultsCount, setAdultsCount] = useState<number>(2)

  // Controlled date inputs so we can drive the availability check.
  const [checkIn, setCheckIn] = useState<string>(today)
  const [checkOut, setCheckOut] = useState<string>(tomorrow)

  const [availability, setAvailability] = useState<AvailabilityResult | null>(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)

  // Debounced availability check whenever the date range changes.
  useEffect(() => {
    if (!checkIn || !checkOut || checkIn >= checkOut) {
      setAvailability(null)
      return
    }
    setAvailabilityLoading(true)
    let cancelled = false
    const handle = setTimeout(async () => {
      const res = await checkAvailability(checkIn, checkOut)
      if (cancelled) return
      setAvailabilityLoading(false)
      if (res.ok) setAvailability(res.data)
      else setAvailability(null)
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [checkIn, checkOut])

  // Auto-sync adults count when sharing mode changes between solo/sharing/separate
  // (only adjust the obvious cases — leave it alone if user typed something else)
  const onSharingChange = (next: 'sharing' | 'separate' | 'solo') => {
    setAdultsSharing(next)
    if (next === 'solo') setAdultsCount(1)
    else if (adultsCount < 2) setAdultsCount(2)
  }

  const addChild = () => {
    setChildren((prev) => [
      ...prev,
      {
        uiId: makeUiId(),
        age_band: 'child',
        sleep_arrangement: defaultArrangementFor('child'),
      },
    ])
  }

  const removeChild = (uiId: string) => {
    setChildren((prev) => prev.filter((c) => c.uiId !== uiId))
  }

  const updateChild = (uiId: string, patch: Partial<ChildRow>) => {
    setChildren((prev) =>
      prev.map((c) => {
        if (c.uiId !== uiId) return c
        const next = { ...c, ...patch }
        // If age band changes, snap arrangement to a valid one for the new band
        if (patch.age_band && !ALLOWED_ARRANGEMENTS[next.age_band].includes(next.sleep_arrangement)) {
          next.sleep_arrangement = defaultArrangementFor(next.age_band)
        }
        return next
      })
    )
  }

  // Convert the children state into hidden form fields the server can read
  const childrenJson = JSON.stringify(
    children.map((c, i) => ({
      age_band: c.age_band,
      sleep_arrangement: c.sleep_arrangement,
      position: i,
    }))
  )

  // Compute "sharing" boolean for the server
  // - "sharing" or "solo" → adults_sharing = true (one bed for the adults)
  // - "separate"          → adults_sharing = false
  const adultsSharingBool = adultsSharing !== 'separate'

  return (
    <form action={createBookingRequest} className="space-y-6 fg-card p-6">
      {/* Hidden fields the server reads */}
      <input type="hidden" name="adults_sharing" value={adultsSharingBool ? '1' : '0'} />
      <input type="hidden" name="children_json" value={childrenJson} />
      {/* Keep `children` field for back-compat / fast count on the server */}
      <input type="hidden" name="children" value={String(children.length)} />

      {/* Dates */}
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
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
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
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className="fg-input"
          />
        </div>
      </div>

      {/* Availability hint — updates as the user picks dates. Advisory
          only; final conflict logic runs at approval time. */}
      <AvailabilityIndicator
        loading={availabilityLoading}
        result={availability}
      />

      {/* Adults */}
      <div>
        <label className="fg-label">Adults</label>
        <div className="space-y-2">
          {(['solo', 'sharing', 'separate'] as const).map((opt) => (
            <label
              key={opt}
              className="fg-radio-row"
              data-checked={adultsSharing === opt ? '1' : '0'}
            >
              <input
                type="radio"
                name="adults_sharing_choice"
                value={opt}
                checked={adultsSharing === opt}
                onChange={() => onSharingChange(opt)}
              />
              <span className="fg-radio-label">
                {opt === 'solo' && 'Just me'}
                {opt === 'sharing' && '2 adults sharing one bed'}
                {opt === 'separate' && '2 adults, separate beds'}
              </span>
            </label>
          ))}
        </div>

        {/* Hidden 'adults' field — uses count, derived from choice */}
        <input type="hidden" name="adults" value={String(adultsCount)} />

        {/* Larger groups can override */}
        <details className="mt-3">
          <summary
            className="text-xs fg-mono cursor-pointer"
            style={{ color: 'var(--color-muted)' }}
          >
            More than 2 adults?
          </summary>
          <div className="mt-2">
            <label htmlFor="adults_count_visible" className="fg-label">
              Total adults in your group
            </label>
            <input
              id="adults_count_visible"
              type="number"
              min={1}
              max={10}
              value={adultsCount}
              onChange={(e) => setAdultsCount(parseInt(e.target.value, 10) || 1)}
              className="fg-input"
              style={{ maxWidth: 120 }}
            />
            <p
              className="text-xs fg-mono mt-1"
              style={{ color: 'var(--color-muted)' }}
            >
              We'll work out bed arrangements with you for larger groups.
            </p>
          </div>
        </details>
      </div>

      {/* Children */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="fg-label" style={{ marginBottom: 0 }}>
            Children {children.length > 0 && `(${children.length})`}
          </label>
          <button
            type="button"
            onClick={addChild}
            className="fg-btn-ghost text-xs"
            style={{ width: 'auto', padding: '6px 12px', minHeight: 0 }}
          >
            + Add child
          </button>
        </div>

        {children.length === 0 && (
          <p
            className="text-xs fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            No children. Tap + Add child if you're bringing any.
          </p>
        )}

        <div className="space-y-3">
          {children.map((c, i) => (
            <div key={c.uiId} className="fg-child-row">
              <div className="fg-child-row-head">
                <span
                  className="fg-section-label"
                  style={{ color: 'var(--color-muted)' }}
                >
                  Child {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeChild(c.uiId)}
                  className="text-xs fg-mono"
                  style={{ color: 'var(--color-red)' }}
                  aria-label={`Remove child ${i + 1}`}
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="fg-label">Age</label>
                  <select
                    className="fg-input"
                    value={c.age_band}
                    onChange={(e) =>
                      updateChild(c.uiId, { age_band: e.target.value as AgeBand })
                    }
                  >
                    {AGE_BANDS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label} — {b.hint}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="fg-label">Sleeping</label>
                  <select
                    className="fg-input"
                    value={c.sleep_arrangement}
                    onChange={(e) =>
                      updateChild(c.uiId, {
                        sleep_arrangement: e.target.value as SleepArrangement,
                      })
                    }
                  >
                    {ALLOWED_ARRANGEMENTS[c.age_band].map((opt) => (
                      <option key={opt} value={opt}>
                        {ARRANGEMENT_LABELS[opt]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {c.sleep_arrangement === 'cot' && (
                <p
                  className="text-xs fg-mono mt-2"
                  style={{ color: 'var(--color-amber)' }}
                >
                  💡 Foxgrove Road doesn't supply cots — please bring a travel cot.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
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

      {/* Submit */}
      <div className="flex items-center gap-3 pt-2">
        <button type="submit" className="fg-btn-primary">
          Submit request
        </button>
        <a href="/bookings" className="fg-btn-ghost">
          Cancel
        </a>
      </div>
    </form>
  )
}

function AvailabilityIndicator({
  loading,
  result,
}: {
  loading: boolean
  result: AvailabilityResult | null
}) {
  if (loading && !result) {
    return (
      <div
        className="text-xs fg-mono"
        style={{ color: 'var(--color-muted)' }}
      >
        Checking availability…
      </div>
    )
  }
  if (!result) return null

  const palette = {
    green: { dot: '#16a34a', bg: 'rgba(22, 163, 74, 0.08)' },
    yellow: { dot: '#d97706', bg: 'rgba(217, 119, 6, 0.08)' },
    red: { dot: '#dc2626', bg: 'rgba(220, 38, 38, 0.08)' },
  }[result.level]

  const label = (() => {
    if (result.level === 'green') return 'Likely available — no bedrooms booked for these dates.'
    if (result.level === 'red')
      return `All ${result.totalRooms} bedrooms are taken for these dates. Approval is unlikely.`
    // yellow
    const rooms = result.freeRooms === 1 ? '1 bedroom' : `${result.freeRooms} bedrooms`
    return `${rooms} still free — admin will confirm bed assignments on approval.`
  })()

  return (
    <div
      className="text-sm flex items-center gap-2 rounded px-3 py-2"
      style={{ background: palette.bg, color: 'var(--color-ink)' }}
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: palette.dot,
          flexShrink: 0,
        }}
      />
      <span>{label}</span>
    </div>
  )
}

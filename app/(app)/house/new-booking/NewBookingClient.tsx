'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBookingForUser } from '../actions'

type UserRow = { id: string; full_name: string; role: string }

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default function NewBookingClient({ users }: { users: UserRow[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [userId, setUserId] = useState('')
  const [checkIn, setCheckIn] = useState(todayISO())
  const [checkOut, setCheckOut] = useState(tomorrowISO())
  const [adults, setAdults] = useState('2')
  const [children, setChildren] = useState('0')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    if (!userId) {
      setError('Pick a user')
      return
    }
    setBusy(true)
    const fd = new FormData()
    fd.append('requested_by', userId)
    fd.append('check_in', checkIn)
    fd.append('check_out', checkOut)
    fd.append('adults', adults)
    fd.append('children', children)
    if (notes) fd.append('notes', notes)
    const result = await createBookingForUser(fd)
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    // Land on /house with the panel open for bed assignment
    startTransition(() => {
      router.push(`/house?request=${result.request_id}&saved=Booking%20created`)
    })
  }

  return (
    <div className="fg-card p-5">
      {error && <div className="fg-msg-error mb-4">{error}</div>}

      <div className="space-y-4">
        <div>
          <label className="fg-label">Book on behalf of</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="fg-input"
          >
            <option value="">-- pick a user --</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role})
              </option>
            ))}
          </select>
          {users.length === 0 && (
            <p
              className="text-xs fg-mono mt-1"
              style={{ color: 'var(--color-amber)' }}
            >
              No users yet. Invite someone from the Team page first.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="fg-label">Check-in</label>
            <input
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="fg-input"
            />
          </div>
          <div>
            <label className="fg-label">Check-out</label>
            <input
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="fg-input"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="fg-label">Adults</label>
            <input
              type="number"
              min={1}
              max={20}
              value={adults}
              onChange={(e) => setAdults(e.target.value)}
              className="fg-input"
            />
          </div>
          <div>
            <label className="fg-label">Children</label>
            <input
              type="number"
              min={0}
              max={20}
              value={children}
              onChange={(e) => setChildren(e.target.value)}
              className="fg-input"
            />
          </div>
        </div>

        <div>
          <label className="fg-label">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="fg-input"
            placeholder="Any context for this booking"
            maxLength={1000}
          />
        </div>

        <p
          className="text-xs fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          The booking is created as approved. After saving, you&apos;ll
          land on the House page with the panel open so you can assign beds.
        </p>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !userId}
          className="fg-btn-gold"
          style={{ width: 'auto', padding: '10px 22px' }}
        >
          {busy ? 'Creating…' : 'Create booking'}
        </button>
      </div>
    </div>
  )
}

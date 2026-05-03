'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBookingForUser } from '../actions'
import { createGuest } from '../../admin/guests/actions'

type GuestWithAccount = {
  guest_id: string
  profile_id: string
  full_name: string
  role: string
}
type LinkableProfile = { id: string; full_name: string; role: string }

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default function NewBookingClient({
  guestsWithAccounts,
  linkableProfiles,
}: {
  guestsWithAccounts: GuestWithAccount[]
  linkableProfiles: LinkableProfile[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // The picker can be in two modes:
  //   - 'pick' — choose an existing guest with account
  //   - 'new'  — create a new guest, optionally linking to an account
  const [mode, setMode] = useState<'pick' | 'new'>('pick')

  const [profileId, setProfileId] = useState('')
  const [newGuestName, setNewGuestName] = useState('')
  const [newGuestLinkProfileId, setNewGuestLinkProfileId] = useState('')

  const [checkIn, setCheckIn] = useState(todayISO())
  const [checkOut, setCheckOut] = useState(tomorrowISO())
  const [adults, setAdults] = useState('2')
  const [children, setChildren] = useState('0')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)

    let resolvedProfileId = profileId

    if (mode === 'new') {
      if (!newGuestName.trim()) {
        setError(
          'Type a name for the new guest, or pick an existing one above.',
        )
        return
      }
      if (!newGuestLinkProfileId) {
        // The guest needs a linked account to be the booking requester.
        // Without one, we can't create a booking_request for them
        // because requested_by must be a profile id.
        setError(
          "To make this guest the booking's requester, link them to an account holder below. Otherwise, create the booking under your own name and assign this guest to a bed afterward.",
        )
        return
      }

      // Create the guest first, then use that linked profile as requested_by.
      setBusy(true)
      const gfd = new FormData()
      gfd.append('full_name', newGuestName.trim())
      gfd.append('linked_profile_id', newGuestLinkProfileId)
      const guestResult = await createGuest(gfd)
      if (guestResult.error) {
        setBusy(false)
        setError('Failed to add guest: ' + guestResult.error)
        return
      }
      resolvedProfileId = newGuestLinkProfileId
    }

    if (!resolvedProfileId) {
      setError('Pick a guest')
      return
    }

    setBusy(true)
    const fd = new FormData()
    fd.append('requested_by', resolvedProfileId)
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
    startTransition(() => {
      router.push(
        `/house?request=${result.request_id}&saved=Booking%20created`,
      )
    })
  }

  const noGuestsYet = guestsWithAccounts.length === 0

  return (
    <div className="fg-card p-5">
      {error && <div className="fg-msg-error mb-4">{error}</div>}

      <div className="space-y-4">
        <div>
          <label className="fg-label">Book on behalf of</label>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setMode('pick')}
              className={mode === 'pick' ? 'fg-btn-gold' : 'fg-btn-ghost'}
              style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
              disabled={noGuestsYet}
            >
              Pick existing
            </button>
            <button
              type="button"
              onClick={() => setMode('new')}
              className={mode === 'new' ? 'fg-btn-gold' : 'fg-btn-ghost'}
              style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
            >
              + Add new guest
            </button>
          </div>

          {mode === 'pick' && (
            <>
              {noGuestsYet ? (
                <div className="fg-msg-error" style={{ fontSize: 13 }}>
                  No guests with accounts yet. Use &ldquo;+ Add new
                  guest&rdquo; above, or invite someone from the Team
                  page first.
                </div>
              ) : (
                <select
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  className="fg-input"
                >
                  <option value="">— pick a guest —</option>
                  {guestsWithAccounts.map((g) => (
                    <option key={g.profile_id} value={g.profile_id}>
                      {g.full_name} ({g.role})
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

          {mode === 'new' && (
            <div className="space-y-2">
              <input
                type="text"
                value={newGuestName}
                onChange={(e) => setNewGuestName(e.target.value)}
                placeholder="Guest's full name"
                maxLength={200}
                className="fg-input"
              />
              <select
                value={newGuestLinkProfileId}
                onChange={(e) => setNewGuestLinkProfileId(e.target.value)}
                className="fg-input"
              >
                <option value="">— link to which account? —</option>
                {linkableProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.role})
                  </option>
                ))}
              </select>
              <p
                className="text-xs fg-mono"
                style={{ color: 'var(--color-muted)' }}
              >
                Adding a guest here also creates a guest record in
                Guests. To create a booking for someone without any
                account, use your own name as the requester and assign
                the guest to a bed in the panel afterward.
              </p>
            </div>
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
          The booking is created as approved. You&apos;ll land on the
          House page with the panel open so you can assign beds.
        </p>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className="fg-btn-gold"
          style={{ width: 'auto', padding: '10px 22px' }}
        >
          {busy ? 'Creating…' : 'Create booking'}
        </button>
      </div>
    </div>
  )
}

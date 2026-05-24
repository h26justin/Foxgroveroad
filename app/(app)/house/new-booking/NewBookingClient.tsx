'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { floorLabel } from '@/lib/floors'
import { createBookingWithGuests } from '../actions'

type Guest = {
  id: string
  full_name: string
  linked: boolean
  role: string | null
}
type LinkableProfile = { id: string; full_name: string; role: string }
type Room = {
  id: string
  name: string
  floor: number
  is_owner_room: boolean
}

type GuestRow = {
  // Local UI key
  rowKey: string
  // What the user typed
  name: string
  // If the typed name exactly matches an existing guest's name, we
  // resolve to that id. Otherwise this stays null and the server creates
  // a new guest record on submit.
  matchedGuestId: string | null
  // Optional: when typing a new name, admin can link to an account
  linkProfileId: string | null
  // Optional: per-guest room to auto-assign to. '' = no auto-assign,
  // admin picks the bed later from the panel.
  roomId: string
}

function RoomPickerRow({
  rooms,
  value,
  onChange,
}: {
  rooms: Room[]
  value: string
  onChange: (id: string) => void
}) {
  const byFloor = new Map<number, Room[]>()
  for (const r of rooms) {
    if (!byFloor.has(r.floor)) byFloor.set(r.floor, [])
    byFloor.get(r.floor)!.push(r)
  }
  const floorsDesc = Array.from(byFloor.keys()).sort((a, b) => b - a)
  return (
    <div className="mt-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="fg-input"
        style={{ fontSize: 13 }}
        aria-label="Room (optional auto-assign)"
      >
        <option value="">— Pick a room (optional, auto-picks bed) —</option>
        {floorsDesc.map((floor) => (
          <optgroup key={floor} label={floorLabel(floor)}>
            {byFloor.get(floor)!.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.is_owner_room ? ' (owner only)' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

// v45: local-getter form so the date matches what the user sees on
// their wall clock. toISOString().slice(0,10) returns UTC, which is a
// day BEHIND local for evening hours in BST (UTC+1).
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let _rowCounter = 0
function newRowKey() {
  _rowCounter += 1
  return `row-${Date.now()}-${_rowCounter}`
}

export default function NewBookingClient({
  allGuests,
  linkableProfiles,
  rooms,
}: {
  allGuests: Guest[]
  linkableProfiles: LinkableProfile[]
  rooms: Room[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [checkIn, setCheckIn] = useState(todayISO())
  const [checkOut, setCheckOut] = useState(tomorrowISO())
  const [adults, setAdults] = useState('2')
  const [children, setChildren] = useState('0')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Start with two empty rows (most stays are at least two people)
  const [rows, setRows] = useState<GuestRow[]>(() => [
    { rowKey: newRowKey(), name: '', matchedGuestId: null, linkProfileId: null, roomId: '' },
    { rowKey: newRowKey(), name: '', matchedGuestId: null, linkProfileId: null, roomId: '' },
  ])

  function updateRow(rowKey: string, patch: Partial<GuestRow>) {
    setRows((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r)),
    )
  }
  function removeRow(rowKey: string) {
    setRows((prev) => prev.filter((r) => r.rowKey !== rowKey))
  }
  function addRow() {
    setRows((prev) => [
      ...prev,
      { rowKey: newRowKey(), name: '', matchedGuestId: null, linkProfileId: null, roomId: '' },
    ])
  }

  function handleNameChange(rowKey: string, name: string) {
    // Look for an exact case-insensitive match against existing guests
    const trimmed = name.trim()
    const match = trimmed
      ? allGuests.find(
          (g) => g.full_name.toLowerCase() === trimmed.toLowerCase(),
        )
      : null
    updateRow(rowKey, {
      name,
      matchedGuestId: match?.id ?? null,
      // If we just matched an existing guest, reset link picker
      linkProfileId: match ? null : undefined as any,
    })
  }

  async function handleSubmit() {
    setError(null)

    // Filter to non-empty rows
    const validRows = rows.filter((r) => r.name.trim().length > 0)
    if (validRows.length === 0) {
      setError('Add at least one guest staying')
      return
    }

    // Build payload entries. Per-row room hints (v43) are sent alongside
    // each guest so the server can chain bed assignment in one pass.
    const guestsPayload = validRows.map((r) => {
      const base: any = r.matchedGuestId
        ? { guest_id: r.matchedGuestId }
        : r.linkProfileId
          ? { full_name: r.name.trim(), link_profile_id: r.linkProfileId }
          : { full_name: r.name.trim() }
      if (r.roomId) base.room_id = r.roomId
      return base
    })

    setBusy(true)
    const fd = new FormData()
    fd.append('check_in', checkIn)
    fd.append('check_out', checkOut)
    fd.append('adults', adults)
    fd.append('children', children)
    if (notes) fd.append('notes', notes)
    fd.append('guests', JSON.stringify(guestsPayload))

    const result = await createBookingWithGuests(fd)
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }

    const failures = result.assignment_failures ?? []
    const savedMsg =
      failures.length === 0
        ? 'Booking created'
        : `Booking created — ${failures.length} bed${
            failures.length === 1 ? '' : 's'
          } couldn't auto-assign`

    startTransition(() => {
      router.push(
        `/house?request=${result.request_id}&saved=${encodeURIComponent(savedMsg)}`,
      )
    })
  }

  return (
    <div className="fg-card p-5">
      {error && <div className="fg-msg-error mb-4">{error}</div>}

      <div className="space-y-4">
        {/* Dates */}
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

        {/* Headcount (still useful for cot logic etc.) */}
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

        {/* Guests staying */}
        <div>
          <label className="fg-label">Guests staying</label>
          <p
            className="text-xs fg-mono mb-2"
            style={{ color: 'var(--color-muted)' }}
          >
            Type each guest&apos;s name. If they&apos;re saved already
            you&apos;ll see them autocomplete; new names get added to
            your guest book automatically.
          </p>

          {/* Datalist of saved guest names */}
          <datalist id="fg-saved-guests">
            {allGuests.map((g) => (
              <option key={g.id} value={g.full_name}>
                {g.linked ? `(${g.role})` : '(saved guest)'}
              </option>
            ))}
          </datalist>

          <div className="space-y-2">
            {rows.map((row, idx) => {
              const isMatched = !!row.matchedGuestId
              const trimmed = row.name.trim()
              const isNewName = trimmed.length > 0 && !isMatched
              return (
                <div
                  key={row.rowKey}
                  className="space-y-1"
                  style={{
                    border: '1px solid var(--color-warm)',
                    borderRadius: 8,
                    padding: 10,
                    background: 'var(--color-cream)',
                  }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      list="fg-saved-guests"
                      value={row.name}
                      onChange={(e) =>
                        handleNameChange(row.rowKey, e.target.value)
                      }
                      placeholder={
                        idx === 0
                          ? 'e.g. Rebecca Hammond'
                          : 'Add another guest…'
                      }
                      maxLength={200}
                      className="fg-input"
                      style={{ flex: 1, minWidth: 200 }}
                    />
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(row.rowKey)}
                        disabled={busy}
                        aria-label="Remove this guest"
                        className="fg-mono text-sm"
                        style={{
                          background: 'transparent',
                          color: 'var(--color-red)',
                          padding: '8px 12px',
                          border: '1px solid var(--color-warm)',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Helper text: matched, new, or empty */}
                  {isMatched && (
                    <div
                      className="text-xs fg-mono"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      ✓ Saved guest
                    </div>
                  )}
                  {isNewName && (
                    <div
                      className="text-xs fg-mono"
                      style={{ color: 'var(--color-amber)' }}
                    >
                      + New guest — will be added to your guest book
                    </div>
                  )}

                  {/* Optional account link for typed-new names */}
                  {isNewName && linkableProfiles.length > 0 && (
                    <div className="mt-1">
                      <select
                        value={row.linkProfileId ?? ''}
                        onChange={(e) =>
                          updateRow(row.rowKey, {
                            linkProfileId: e.target.value || null,
                          })
                        }
                        className="fg-input"
                        style={{ fontSize: 13 }}
                      >
                        <option value="">
                          — link to account (optional) —
                        </option>
                        {linkableProfiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name} ({p.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* v43: per-guest room picker. Auto-picks first free
                      bed in the room on save. Optional — admin can still
                      assign beds from the panel later. */}
                  <RoomPickerRow
                    rooms={rooms}
                    value={row.roomId}
                    onChange={(roomId) =>
                      updateRow(row.rowKey, { roomId })
                    }
                  />
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={addRow}
            disabled={busy}
            className="fg-btn-ghost text-xs mt-3"
            style={{ width: 'auto', padding: '6px 12px' }}
          >
            + Add another guest
          </button>
        </div>

        {/* Notes */}
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
          House page with the panel open to assign beds.
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

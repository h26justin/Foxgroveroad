'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateGuest,
  linkGuestToProfile,
  unlinkGuestFromProfile,
  deleteGuest,
} from '../actions'

type LinkedProfile = {
  id: string
  full_name: string
  role: string
  phone: string | null
}

type Guest = {
  id: string
  full_name: string
  linked_profile_id: string | null
  dietary_notes: string
  allergies: string
  room_preference: string
  things_they_bring: string
  general_notes: string
  linked_profile: LinkedProfile | null
}

type LinkableProfile = { id: string; full_name: string; role: string }

type Stay = {
  key: string
  check_in: string
  check_out: string
  status: string
  notes: string | null
  source: 'as_guest' | 'as_requester'
  request_id: string | null
}

export default function GuestDetailClient({
  guest,
  linkableProfiles,
  stays,
}: {
  guest: Guest
  linkableProfiles: LinkableProfile[]
  stays: Stay[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [fullName, setFullName] = useState(guest.full_name)
  const [dietary, setDietary] = useState(guest.dietary_notes)
  const [allergies, setAllergies] = useState(guest.allergies)
  const [roomPref, setRoomPref] = useState(guest.room_preference)
  const [thingsBring, setThingsBring] = useState(guest.things_they_bring)
  const [general, setGeneral] = useState(guest.general_notes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [linkingMode, setLinkingMode] = useState(false)
  const [linkProfileId, setLinkProfileId] = useState('')

  const isDirty =
    fullName !== guest.full_name ||
    dietary !== guest.dietary_notes ||
    allergies !== guest.allergies ||
    roomPref !== guest.room_preference ||
    thingsBring !== guest.things_they_bring ||
    general !== guest.general_notes

  async function handleSave() {
    setError(null)
    setSuccess(null)
    if (!fullName.trim()) {
      setError('Name is required')
      return
    }
    setBusy(true)
    const fd = new FormData()
    fd.append('guest_id', guest.id)
    fd.append('full_name', fullName.trim())
    fd.append('dietary_notes', dietary)
    fd.append('allergies', allergies)
    fd.append('room_preference', roomPref)
    fd.append('things_they_bring', thingsBring)
    fd.append('general_notes', general)
    const r = await updateGuest(fd)
    setBusy(false)
    if (r.error) {
      setError(r.error)
      return
    }
    setSuccess('Saved.')
    startTransition(() => router.refresh())
  }

  async function handleLink() {
    if (!linkProfileId) return
    setBusy(true)
    setError(null)
    const r = await linkGuestToProfile(guest.id, linkProfileId)
    setBusy(false)
    if (r.error) {
      setError(r.error)
      return
    }
    setLinkingMode(false)
    setLinkProfileId('')
    setSuccess('Linked to account.')
    startTransition(() => router.refresh())
  }

  async function handleUnlink() {
    if (!confirm('Unlink this guest from the account? Notes stay attached to the guest.')) return
    setBusy(true)
    setError(null)
    const r = await unlinkGuestFromProfile(guest.id)
    setBusy(false)
    if (r.error) {
      setError(r.error)
      return
    }
    setSuccess('Unlinked.')
    startTransition(() => router.refresh())
  }

  async function handleDelete() {
    if (
      !confirm(
        `Permanently delete the guest record for "${guest.full_name}"?\n\nNotes will be lost. Bed bookings that had this guest assigned will keep their text labels but won't link back.`,
      )
    )
      return
    setBusy(true)
    setError(null)
    const r = await deleteGuest(guest.id)
    if (r?.error) {
      setBusy(false)
      setError(r.error)
    }
    // On success, deleteGuest redirects server-side
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h1
            className="text-3xl"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            {guest.full_name}
          </h1>
          {guest.linked_profile && (
            <span
              className="fg-pill text-xs"
              style={{
                background: 'var(--color-warm)',
                color: 'var(--color-muted)',
              }}
            >
              🔗 {guest.linked_profile.role}
            </span>
          )}
        </div>
        {guest.linked_profile?.phone && (
          <p
            className="text-sm fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            📱 {guest.linked_profile.phone}
          </p>
        )}
      </div>

      {error && <div className="fg-msg-error mb-4">{error}</div>}
      {success && <div className="fg-msg-success mb-4">{success}</div>}

      {/* Account link card */}
      <section className="fg-card p-4 mb-6">
        <h2 className="fg-section-label mb-2">Account link</h2>
        {guest.linked_profile ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div
                className="text-sm"
                style={{ color: 'var(--color-ink)' }}
              >
                Linked to{' '}
                <strong>{guest.linked_profile.full_name}</strong>
              </div>
              <div
                className="text-xs fg-mono mt-1"
                style={{ color: 'var(--color-muted)' }}
              >
                Notes here apply when this person logs in to make
                bookings, and stay history merges across both sources.
              </div>
            </div>
            <button
              type="button"
              onClick={handleUnlink}
              disabled={busy}
              className="fg-btn-ghost text-xs"
              style={{ width: 'auto', padding: '6px 12px' }}
            >
              Unlink
            </button>
          </div>
        ) : linkingMode ? (
          <div className="space-y-3">
            <p
              className="text-xs fg-mono"
              style={{ color: 'var(--color-muted)' }}
            >
              Link this guest to an account holder. Their stay history
              will merge.
            </p>
            <select
              value={linkProfileId}
              onChange={(e) => setLinkProfileId(e.target.value)}
              className="fg-input"
            >
              <option value="">— pick an account —</option>
              {linkableProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.role})
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleLink}
                disabled={busy || !linkProfileId}
                className="fg-btn-gold"
                style={{ width: 'auto', padding: '8px 16px' }}
              >
                {busy ? 'Linking…' : 'Link'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLinkingMode(false)
                  setLinkProfileId('')
                }}
                className="fg-btn-ghost"
                style={{ width: 'auto', padding: '8px 14px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p
              className="text-xs fg-mono"
              style={{ color: 'var(--color-muted)' }}
            >
              Not linked. They&apos;re a guest, not an account holder.
              Link them if they sign up later.
            </p>
            {linkableProfiles.length > 0 && (
              <button
                type="button"
                onClick={() => setLinkingMode(true)}
                className="fg-btn-ghost text-xs"
                style={{ width: 'auto', padding: '6px 12px' }}
              >
                Link to account
              </button>
            )}
          </div>
        )}
      </section>

      {/* Edit form */}
      <section className="mb-8">
        <h2 className="fg-section-label mb-3">Notes</h2>
        <div className="fg-card p-5 space-y-4">
          <div>
            <label className="fg-label">Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={200}
              className="fg-input"
            />
          </div>

          <NoteField
            label="Allergies / medical"
            hint="Important — flagged separately so it doesn't get lost."
            value={allergies}
            onChange={setAllergies}
            rows={2}
            max={500}
            emphasis
          />
          <NoteField
            label="Dietary notes"
            hint="What they don't eat, what they prefer."
            value={dietary}
            onChange={setDietary}
            rows={2}
            max={500}
          />
          <NoteField
            label="Room preference"
            hint="Which room they like best, which to avoid."
            value={roomPref}
            onChange={setRoomPref}
            rows={2}
            max={500}
          />
          <NoteField
            label="Things they bring"
            hint="Pets, gear, special items — affects what to prep."
            value={thingsBring}
            onChange={setThingsBring}
            rows={2}
            max={500}
          />
          <NoteField
            label="General notes / quirks"
            hint="Anything else worth remembering."
            value={general}
            onChange={setGeneral}
            rows={4}
            max={1000}
          />

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || !isDirty}
              className="fg-btn-gold"
              style={{ width: 'auto', padding: '8px 18px' }}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            {isDirty && !busy && (
              <span
                className="text-xs fg-mono"
                style={{ color: 'var(--color-muted)' }}
              >
                Unsaved changes
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Stay history */}
      <section className="mb-8">
        <h2 className="fg-section-label mb-3">Stay history</h2>

        {stays.length === 0 ? (
          <div className="fg-card p-6 text-center">
            <p
              className="text-sm"
              style={{ color: 'var(--color-muted)' }}
            >
              No stays recorded yet.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {stays.map((s) => (
              <StayRow key={s.key} stay={s} />
            ))}
          </div>
        )}
      </section>

      {/* Danger zone */}
      <section>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="fg-btn-ghost text-xs"
          style={{
            width: 'auto',
            padding: '6px 12px',
            color: 'var(--color-red)',
          }}
        >
          Delete guest record
        </button>
      </section>
    </div>
  )
}

function StayRow({ stay }: { stay: Stay }) {
  const ci = new Date(stay.check_in + 'T00:00:00')
  const co = new Date(stay.check_out + 'T00:00:00')
  const nights = Math.round((co.getTime() - ci.getTime()) / 86400000)

  const statusMeta: Record<string, { label: string; cls: string }> = {
    approved: { label: '✓ Approved', cls: 'fg-pill-success' },
    pending: { label: '⏳ Pending', cls: 'fg-pill-amber' },
    cancelled: { label: '✕ Cancelled', cls: 'fg-pill-muted' },
    declined: { label: '✕ Declined', cls: 'fg-pill-muted' },
  }
  const m = statusMeta[stay.status] ?? {
    label: stay.status,
    cls: 'fg-pill-muted',
  }

  return (
    <div className="fg-card p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div
            className="text-sm"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            {ci.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}{' '}
            →{' '}
            {co.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </div>
          <div
            className="text-xs fg-mono mt-1"
            style={{ color: 'var(--color-muted)' }}
          >
            {nights} night{nights === 1 ? '' : 's'} ·{' '}
            {stay.source === 'as_requester'
              ? 'requested the booking'
              : 'assigned to a bed'}
          </div>
          {stay.notes && (
            <div
              className="text-xs mt-2 italic"
              style={{ color: 'var(--color-ink)' }}
            >
              &ldquo;{stay.notes}&rdquo;
            </div>
          )}
        </div>
        <span className={`fg-pill ${m.cls} text-xs`}>{m.label}</span>
      </div>
    </div>
  )
}

function NoteField({
  label,
  hint,
  value,
  onChange,
  rows,
  max,
  emphasis,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  rows: number
  max: number
  emphasis?: boolean
}) {
  return (
    <div>
      <label
        className="fg-label"
        style={emphasis ? { color: 'var(--color-amber)' } : undefined}
      >
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={max}
        className="fg-input"
        placeholder={hint}
      />
      <div
        className="text-xs fg-mono mt-1 flex justify-between"
        style={{ color: 'var(--color-muted)' }}
      >
        <span>{hint}</span>
        <span>
          {value.length}/{max}
        </span>
      </div>
    </div>
  )
}

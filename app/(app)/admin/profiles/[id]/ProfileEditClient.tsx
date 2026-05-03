'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfileNotes } from '../actions'

type Initial = {
  dietary_notes: string
  allergies: string
  room_preference: string
  things_they_bring: string
  general_notes: string
}

export default function ProfileEditClient({
  profileId,
  initial,
}: {
  profileId: string
  initial: Initial
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [dietary, setDietary] = useState(initial.dietary_notes)
  const [allergies, setAllergies] = useState(initial.allergies)
  const [roomPref, setRoomPref] = useState(initial.room_preference)
  const [thingsBring, setThingsBring] = useState(initial.things_they_bring)
  const [general, setGeneral] = useState(initial.general_notes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isDirty =
    dietary !== initial.dietary_notes ||
    allergies !== initial.allergies ||
    roomPref !== initial.room_preference ||
    thingsBring !== initial.things_they_bring ||
    general !== initial.general_notes

  async function handleSave() {
    setError(null)
    setSuccess(null)
    setBusy(true)
    const fd = new FormData()
    fd.append('profile_id', profileId)
    fd.append('dietary_notes', dietary)
    fd.append('allergies', allergies)
    fd.append('room_preference', roomPref)
    fd.append('things_they_bring', thingsBring)
    fd.append('general_notes', general)
    const r = await updateProfileNotes(fd)
    setBusy(false)
    if (r.error) {
      setError(r.error)
      return
    }
    setSuccess('Saved.')
    startTransition(() => router.refresh())
  }

  return (
    <div className="fg-card p-5 space-y-4">
      {error && <div className="fg-msg-error">{error}</div>}
      {success && <div className="fg-msg-success">{success}</div>}

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
          {busy ? 'Saving…' : 'Save notes'}
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

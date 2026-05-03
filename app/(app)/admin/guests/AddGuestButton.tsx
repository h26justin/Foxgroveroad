'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createGuest } from './actions'

type LinkableProfile = { id: string; full_name: string; role: string }

export default function AddGuestButton({
  linkableProfiles,
}: {
  linkableProfiles: LinkableProfile[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState('')
  const [linkedProfileId, setLinkedProfileId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    if (busy) return
    setOpen(false)
    setFullName('')
    setLinkedProfileId('')
    setError(null)
  }

  async function handleSubmit() {
    setError(null)
    if (!fullName.trim()) {
      setError('Name is required')
      return
    }
    setBusy(true)
    const fd = new FormData()
    fd.append('full_name', fullName.trim())
    if (linkedProfileId) fd.append('linked_profile_id', linkedProfileId)
    const r = await createGuest(fd)
    setBusy(false)
    if (r.error) {
      setError(r.error)
      return
    }
    setOpen(false)
    setFullName('')
    setLinkedProfileId('')
    startTransition(() => {
      // Navigate to detail page so admin can immediately add notes
      router.push(`/admin/guests/${r.guest_id}`)
    })
  }

  // When a linkable profile is selected, prefill the name
  function handleProfilePick(profileId: string) {
    setLinkedProfileId(profileId)
    if (profileId) {
      const p = linkableProfiles.find((p) => p.id === profileId)
      if (p && !fullName.trim()) setFullName(p.full_name)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fg-btn-gold text-xs"
        style={{ width: 'auto', padding: '8px 14px' }}
      >
        + Add guest
      </button>
    )
  }

  return (
    <>
      <div className="fg-panel-backdrop" onClick={close} aria-hidden />
      <div className="fg-modal" role="dialog">
        <div className="fg-modal-header">
          <h3
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '18px',
              color: 'var(--color-ink)',
            }}
          >
            Add a guest
          </h3>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="fg-panel-close"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="fg-modal-body">
          {error && <div className="fg-msg-error mb-3">{error}</div>}
          <p
            className="text-xs fg-mono mb-4"
            style={{ color: 'var(--color-muted)' }}
          >
            A guest is anyone who stays — they don&apos;t need an account.
            You can also link to an existing account if they have one.
          </p>

          <div className="mb-3">
            <label className="fg-label">Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="fg-input"
              placeholder="e.g. Mike Smith"
              maxLength={200}
              autoFocus
              disabled={busy}
            />
          </div>

          {linkableProfiles.length > 0 && (
            <div className="mb-3">
              <label className="fg-label">
                Link to account (optional)
              </label>
              <select
                value={linkedProfileId}
                onChange={(e) => handleProfilePick(e.target.value)}
                className="fg-input"
                disabled={busy}
              >
                <option value="">— not linked —</option>
                {linkableProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.role})
                  </option>
                ))}
              </select>
              <div
                className="text-xs fg-mono mt-1"
                style={{ color: 'var(--color-muted)' }}
              >
                Only shown for accounts not yet linked. You can link
                later from the guest&apos;s page.
              </div>
            </div>
          )}
        </div>
        <div className="fg-modal-footer">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="fg-btn-ghost"
            style={{ width: 'auto', padding: '8px 14px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !fullName.trim()}
            className="fg-btn-gold"
            style={{ width: 'auto', padding: '8px 18px' }}
          >
            {busy ? 'Adding…' : 'Add & open'}
          </button>
        </div>
      </div>
    </>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inviteUser } from './invite-actions'

export default function InvitePersonForm() {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'admin' | 'cleaner' | 'family'>('family')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    setSuccess(null)
    setBusy(true)
    const fd = new FormData()
    fd.append('email', email)
    fd.append('full_name', fullName)
    fd.append('role', role)
    const r = await inviteUser(fd)
    setBusy(false)
    if (r.error) {
      setError(r.error)
      return
    }
    setSuccess(`Invite sent to ${email}.`)
    setEmail('')
    setFullName('')
    setRole('family')
    setOpen(false)
    startTransition(() => router.refresh())
  }

  if (!open) {
    return (
      <div className="mb-6">
        {success && <div className="fg-msg-success mb-3">{success}</div>}
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setSuccess(null)
            setError(null)
          }}
          className="fg-btn-gold text-xs"
          style={{ width: 'auto', padding: '8px 14px' }}
        >
          + Invite person
        </button>
      </div>
    )
  }

  return (
    <section className="fg-card p-5 mb-6">
      <h2 className="fg-section-label mb-3">Invite a person</h2>
      <p
        className="text-xs fg-mono mb-4"
        style={{ color: 'var(--color-muted)' }}
      >
        They&apos;ll get a magic-link email to set up their account. Their
        role is set in advance — they can&apos;t change it themselves.
      </p>

      {error && <div className="fg-msg-error mb-3">{error}</div>}

      <div className="space-y-3">
        <div>
          <label className="fg-label">Full name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="fg-input"
            placeholder="e.g. Sarah Hammond"
            maxLength={200}
          />
        </div>
        <div>
          <label className="fg-label">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="fg-input"
            placeholder="sarah@example.com"
          />
        </div>
        <div>
          <label className="fg-label">Role</label>
          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value as 'admin' | 'cleaner' | 'family')
            }
            className="fg-input"
          >
            <option value="family">Family — can request stays</option>
            <option value="cleaner">Cleaner — sees housekeeping + linen</option>
            <option value="admin">Admin — full access</option>
          </select>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !email || !fullName}
            className="fg-btn-gold"
            style={{ width: 'auto', padding: '8px 18px' }}
          >
            {busy ? 'Sending…' : 'Send invite'}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setError(null)
            }}
            disabled={busy}
            className="fg-btn-ghost"
            style={{ width: 'auto', padding: '8px 14px' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </section>
  )
}

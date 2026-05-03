'use client'

import { useState } from 'react'
import { approvePendingUser, deleteUser } from './actions'

/**
 * Row for a user awaiting approval (role='pending').
 *
 * Two actions: Approve (with a role picker — defaults to family) and
 * Reject (uses the v29 deleteUser flow with name confirmation).
 */
export default function PendingUserRow({
  profileId,
  fullName,
  email,
  signedUpAt,
}: {
  profileId: string
  fullName: string
  email: string | null
  signedUpAt: string | null
}) {
  const [confirming, setConfirming] = useState<null | 'approve' | 'reject'>(
    null,
  )
  const [confirmName, setConfirmName] = useState('')

  function cancel() {
    setConfirming(null)
    setConfirmName('')
  }

  const signedUpLabel = signedUpAt
    ? formatRelative(signedUpAt)
    : 'unknown'

  return (
    <div
      className="fg-card p-5"
      style={{
        borderLeftWidth: 4,
        borderLeftStyle: 'solid',
        borderLeftColor: 'var(--color-amber, #A8862E)',
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-base"
              style={{
                fontFamily: 'var(--font-serif)',
                color: 'var(--color-ink)',
              }}
            >
              {fullName}
            </span>
            <span
              className="fg-pill text-xs"
              style={{
                background: 'var(--color-amber, #A8862E)',
                color: 'white',
              }}
            >
              pending
            </span>
          </div>
          <div
            className="text-xs fg-mono mt-1"
            style={{ color: 'var(--color-muted)' }}
          >
            {email ?? 'no email on file'}
            {' · '}signed up {signedUpLabel}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {confirming === 'approve' ? (
            <form
              action={approvePendingUser}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="profile_id" value={profileId} />
              <span
                className="text-xs fg-mono"
                style={{ color: 'var(--color-muted)' }}
              >
                Approve as:
              </span>
              <select
                name="role"
                defaultValue="family"
                className="fg-input text-xs"
                style={{ padding: '6px 10px', minWidth: 110 }}
              >
                <option value="family">family</option>
                <option value="cleaner">cleaner</option>
                <option value="admin">admin</option>
              </select>
              <button type="submit" className="fg-btn-gold text-xs" style={btn}>
                Approve
              </button>
              <button
                type="button"
                onClick={cancel}
                className="fg-btn-ghost text-xs"
                style={btn}
              >
                Cancel
              </button>
            </form>
          ) : confirming === 'reject' ? (
            <form
              action={deleteUser}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="profile_id" value={profileId} />
              <span
                className="text-xs fg-mono"
                style={{ color: 'var(--color-red)' }}
              >
                Type <strong>{fullName}</strong> to reject:
              </span>
              <input
                name="confirm_name"
                type="text"
                required
                autoFocus
                autoComplete="off"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                className="fg-input text-xs"
                style={{ padding: '6px 10px', minWidth: 200 }}
                placeholder={fullName}
              />
              <button
                type="submit"
                disabled={
                  confirmName.trim().toLowerCase() !== fullName.toLowerCase()
                }
                className="fg-btn-ghost text-xs"
                style={{
                  ...btn,
                  background:
                    confirmName.trim().toLowerCase() === fullName.toLowerCase()
                      ? 'var(--color-red)'
                      : undefined,
                  color:
                    confirmName.trim().toLowerCase() === fullName.toLowerCase()
                      ? 'white'
                      : 'var(--color-muted)',
                  opacity:
                    confirmName.trim().toLowerCase() === fullName.toLowerCase()
                      ? 1
                      : 0.6,
                }}
              >
                Reject
              </button>
              <button
                type="button"
                onClick={cancel}
                className="fg-btn-ghost text-xs"
                style={btn}
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirming('approve')}
                className="fg-btn-gold text-xs"
                style={btn}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setConfirming('reject')}
                className="fg-btn-ghost text-xs"
                style={{ ...btn, color: 'var(--color-red)' }}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

const btn: React.CSSProperties = {
  width: 'auto',
  padding: '6px 12px',
  fontSize: 12,
}

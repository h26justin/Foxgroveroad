'use client'

import { useState } from 'react'
import {
  sendPasswordReset,
  sendMagicLink,
  toggleUserBanned,
  deleteUser,
  updateUserEmail,
} from './actions'

/**
 * Renders the small action buttons next to each user. Wraps each one
 * in a "click → confirm → submit" two-step so the buttons aren't a
 * single-tap mistake (sending password reset emails to the wrong
 * person is annoying for everyone).
 *
 * v29: Adds "Change email" (inline form) and "Delete" (requires the
 * admin to type the user's full name as a second-factor confirmation).
 */
export default function UserActionsRow({
  profileId,
  fullName,
  email,
  isMe,
  isBanned,
}: {
  profileId: string
  fullName: string
  email: string | null
  isMe: boolean
  isBanned: boolean
}) {
  const [confirming, setConfirming] = useState<
    null | 'reset' | 'magic' | 'ban' | 'unban' | 'email' | 'delete'
  >(null)
  const [confirmName, setConfirmName] = useState('')

  function cancel() {
    setConfirming(null)
    setConfirmName('')
  }

  if (confirming === 'reset') {
    return (
      <form action={sendPasswordReset} className="flex items-center gap-2">
        <input type="hidden" name="profile_id" value={profileId} />
        <span
          className="text-xs fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          Send password reset email to {email ?? fullName}?
        </span>
        <button type="submit" className="fg-btn-gold text-xs" style={btn}>
          Yes, send
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
    )
  }

  if (confirming === 'magic') {
    return (
      <form action={sendMagicLink} className="flex items-center gap-2">
        <input type="hidden" name="profile_id" value={profileId} />
        <span
          className="text-xs fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          Send fresh login link to {email ?? fullName}?
        </span>
        <button type="submit" className="fg-btn-gold text-xs" style={btn}>
          Yes, send
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
    )
  }

  if (confirming === 'ban') {
    return (
      <form action={toggleUserBanned} className="flex items-center gap-2">
        <input type="hidden" name="profile_id" value={profileId} />
        <input type="hidden" name="should_ban" value="true" />
        <span
          className="text-xs fg-mono"
          style={{ color: 'var(--color-red)' }}
        >
          Disable {fullName}'s account? They won't be able to sign in.
        </span>
        <button
          type="submit"
          className="fg-btn-ghost text-xs"
          style={{ ...btn, background: 'var(--color-red)', color: 'white' }}
        >
          Yes, disable
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
    )
  }

  if (confirming === 'unban') {
    return (
      <form action={toggleUserBanned} className="flex items-center gap-2">
        <input type="hidden" name="profile_id" value={profileId} />
        <input type="hidden" name="should_ban" value="false" />
        <span
          className="text-xs fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          Re-enable {fullName}'s account?
        </span>
        <button type="submit" className="fg-btn-gold text-xs" style={btn}>
          Yes, enable
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
    )
  }

  if (confirming === 'email') {
    return (
      <form
        action={updateUserEmail}
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="profile_id" value={profileId} />
        <span
          className="text-xs fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          New email for {fullName}:
        </span>
        <input
          name="new_email"
          type="email"
          required
          autoFocus
          defaultValue={email ?? ''}
          className="fg-input text-xs"
          style={{ padding: '6px 10px', minWidth: 240 }}
          placeholder="name@example.com"
        />
        <button type="submit" className="fg-btn-gold text-xs" style={btn}>
          Save
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
    )
  }

  if (confirming === 'delete') {
    const nameMatches =
      confirmName.trim().toLowerCase() === fullName.toLowerCase()
    return (
      <form
        action={deleteUser}
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="profile_id" value={profileId} />
        <span
          className="text-xs fg-mono"
          style={{ color: 'var(--color-red)' }}
        >
          Type <strong>{fullName}</strong> to confirm:
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
          disabled={!nameMatches}
          className="fg-btn-ghost text-xs"
          style={{
            ...btn,
            background: nameMatches ? 'var(--color-red)' : undefined,
            color: nameMatches ? 'white' : 'var(--color-muted)',
            opacity: nameMatches ? 1 : 0.6,
            cursor: nameMatches ? 'pointer' : 'not-allowed',
          }}
        >
          Delete user
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
    )
  }

  // Default: row of buttons
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setConfirming('reset')}
        className="fg-btn-ghost text-xs"
        style={btn}
        disabled={!email}
        title={
          email
            ? 'Send password reset email'
            : 'No email on file for this user'
        }
      >
        {isMe ? 'Reset my password' : 'Reset password'}
      </button>
      {!isMe && (
        <>
          <button
            type="button"
            onClick={() => setConfirming('magic')}
            className="fg-btn-ghost text-xs"
            style={btn}
            disabled={!email || isBanned}
            title="Send a fresh login link"
          >
            Send login link
          </button>
          <button
            type="button"
            onClick={() => setConfirming('email')}
            className="fg-btn-ghost text-xs"
            style={btn}
            title="Change this user's email address"
          >
            Change email
          </button>
          <button
            type="button"
            onClick={() => setConfirming(isBanned ? 'unban' : 'ban')}
            className="fg-btn-ghost text-xs"
            style={{
              ...btn,
              ...(isBanned
                ? {}
                : { color: 'var(--color-red)' }),
            }}
          >
            {isBanned ? 'Re-enable' : 'Disable'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming('delete')}
            className="fg-btn-ghost text-xs"
            style={{ ...btn, color: 'var(--color-red)' }}
            title="Permanently remove this user from the team list"
          >
            Delete
          </button>
        </>
      )}
    </div>
  )
}

const btn: React.CSSProperties = {
  width: 'auto',
  padding: '6px 12px',
  fontSize: 12,
}

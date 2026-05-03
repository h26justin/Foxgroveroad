'use client'

import { useState } from 'react'
import {
  sendPasswordReset,
  sendMagicLink,
  toggleUserBanned,
} from './actions'

/**
 * Renders the small action buttons next to each user. Wraps each one
 * in a "click → confirm → submit" two-step so the buttons aren't a
 * single-tap mistake (sending password reset emails to the wrong
 * person is annoying for everyone).
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
    null | 'reset' | 'magic' | 'ban' | 'unban'
  >(null)

  function cancel() {
    setConfirming(null)
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

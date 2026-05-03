'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * The page Supabase's password reset email links to (via the
 * /auth/callback route which exchanges the recovery code for a
 * session). The user is signed in by the time they reach this page.
 *
 * They type a new password; we call updateUser. Sign them out and
 * redirect to /login afterwards so the next sign-in uses the new
 * password fresh.
 */
export default function UpdatePasswordPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  const [authChecked, setAuthChecked] = useState(false)
  const [authedAs, setAuthedAs] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // On mount, confirm we have a session. If not, the link expired or
  // the user is here directly without going through the email flow.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (cancelled) return
      setAuthedAs(data.user?.email ?? null)
      setAuthChecked(true)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords don\'t match.')
      return
    }
    setBusy(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) {
      setError(updateErr.message)
      setBusy(false)
      return
    }
    // Sign out so the next session uses the new password fresh.
    await supabase.auth.signOut()
    setDone(true)
    setBusy(false)
    setTimeout(() => router.replace('/login?password_updated=1'), 1500)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 text-center">
          <h1
            className="text-3xl"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            Set a new password
          </h1>
        </div>

        <div className="fg-card p-6">
          {!authChecked ? (
            <p
              className="text-sm fg-mono"
              style={{ color: 'var(--color-muted)' }}
            >
              Loading…
            </p>
          ) : !authedAs ? (
            <div className="text-sm" style={{ color: 'var(--color-ink)' }}>
              <p className="mb-3">
                The reset link is invalid or has expired.
              </p>
              <p
                className="fg-mono text-xs"
                style={{ color: 'var(--color-muted)' }}
              >
                Ask an admin to send a new reset email, then click the
                fresh link.
              </p>
            </div>
          ) : done ? (
            <div
              className="text-sm flex items-center gap-2"
              style={{ color: 'var(--color-green)' }}
            >
              <span style={{ fontSize: 20 }}>✓</span>
              <span>Password updated. Redirecting to login…</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p
                className="text-sm fg-mono mb-4"
                style={{ color: 'var(--color-muted)' }}
              >
                You're updating the password for{' '}
                <strong style={{ color: 'var(--color-ink)' }}>
                  {authedAs}
                </strong>
                .
              </p>

              {error && <div className="fg-msg-error mb-3">{error}</div>}

              <div className="mb-3">
                <label className="fg-label" htmlFor="pw">
                  New password
                </label>
                <input
                  id="pw"
                  type="password"
                  required
                  autoFocus
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="fg-input"
                  disabled={busy}
                />
                <p
                  className="text-xs fg-mono mt-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  At least 8 characters.
                </p>
              </div>

              <div className="mb-4">
                <label className="fg-label" htmlFor="confirm">
                  Confirm new password
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="fg-input"
                  disabled={busy}
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="fg-btn-gold"
                style={{ width: '100%' }}
              >
                {busy ? 'Saving…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

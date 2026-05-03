'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

/**
 * Bridge page for the magic-link login flow.
 *
 * The implicit-flow magic link redirects the user here with auth
 * tokens in the URL fragment (#access_token=…&refresh_token=…&type=
 * magiclink&…). On mount, the supabase browser client detects those
 * tokens, persists the session to cookies, and we forward the user
 * into the app.
 *
 * We can't redirect straight to /housekeeping because the request
 * arrives at the server with no session cookies yet — the proxy would
 * bounce the user to /login before the client-side hash detection
 * has a chance to run. /auth/* paths are exempt from that bounce.
 *
 * If the link is invalid or expired, the URL fragment instead
 * contains error keys; we surface that so the user knows the link
 * needs regenerating.
 */
export default function FinishLoginPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false

    // Surface any error from the URL fragment first. Supabase puts
    // failures here as #error=…&error_code=…&error_description=… —
    // same shape as the otp_expired case we've seen before.
    if (typeof window !== 'undefined' && window.location.hash) {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const err = params.get('error_description') ?? params.get('error')
      if (err) {
        setErrorMsg(err.replace(/\+/g, ' '))
        setChecking(false)
        return
      }
    }

    // Calling getUser() lets the supabase browser client consume
    // tokens from the URL fragment (detectSessionInUrl is on by
    // default) and persist them to cookies.
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (cancelled) return
      if (data.user) {
        router.replace('/housekeeping')
      } else {
        setErrorMsg('Login link is invalid or has expired.')
        setChecking(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [supabase, router])

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
            Signing you in…
          </h1>
        </div>

        <div className="fg-card p-6">
          {checking ? (
            <p
              className="text-sm fg-mono"
              style={{ color: 'var(--color-muted)' }}
            >
              One moment…
            </p>
          ) : (
            <div className="text-sm" style={{ color: 'var(--color-ink)' }}>
              <p className="mb-3">{errorMsg}</p>
              <p
                className="fg-mono text-xs mb-4"
                style={{ color: 'var(--color-muted)' }}
              >
                Ask an admin to send a fresh login link, then click the new
                one.
              </p>
              <Link
                href="/login"
                className="fg-btn-ghost"
                style={{ display: 'inline-block' }}
              >
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

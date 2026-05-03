'use client'

import { useEffect, useState } from 'react'
import { subscribePush, unsubscribePush, sendTestPush } from '../push/actions'

type State =
  | { kind: 'loading' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'needs-install' } // iOS PWA not installed
  | { kind: 'denied' }
  | { kind: 'idle' } // not subscribed, can subscribe
  | { kind: 'subscribed'; endpoint: string }

const VAPID_PUBLIC =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || ''

/**
 * Convert a base64url string (VAPID public key form) into the
 * Uint8Array that pushManager.subscribe expects as applicationServerKey.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const out = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i)
  return out
}

export default function PushNotificationsSection() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // ─── Initial state detection ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Browser support gates
      if (typeof window === 'undefined') return
      if (!('serviceWorker' in navigator)) {
        if (!cancelled) {
          setState({
            kind: 'unsupported',
            reason: 'This browser does not support service workers.',
          })
        }
        return
      }
      if (!('PushManager' in window)) {
        if (!cancelled) {
          setState({
            kind: 'unsupported',
            reason: 'This browser does not support push notifications.',
          })
        }
        return
      }
      if (!VAPID_PUBLIC) {
        if (!cancelled) {
          setState({
            kind: 'unsupported',
            reason:
              'Notifications are not configured (admin: NEXT_PUBLIC_VAPID_PUBLIC_KEY missing).',
          })
        }
        return
      }

      // iOS-specific gate: web push only works for installed PWAs
      const ua = navigator.userAgent || ''
      const isIOS =
        /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === 'MacIntel' &&
          (navigator as any).maxTouchPoints > 1)
      const isStandalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true
      if (isIOS && !isStandalone) {
        if (!cancelled) setState({ kind: 'needs-install' })
        return
      }

      // Permission already denied → can't be re-prompted from JS
      if (Notification.permission === 'denied') {
        if (!cancelled) setState({ kind: 'denied' })
        return
      }

      // Register SW (or get existing). Doing this even when not yet
      // subscribed primes the system so the subscribe button works
      // instantly when tapped.
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })
        await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        if (!cancelled) {
          if (existing) {
            setState({ kind: 'subscribed', endpoint: existing.endpoint })
          } else {
            setState({ kind: 'idle' })
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setState({
            kind: 'unsupported',
            reason: `Service worker failed to register: ${err?.message ?? 'unknown error'}`,
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ─── Enable handler ───────────────────────────────────────────────
  async function handleEnable() {
    setBusy(true)
    setMessage(null)
    try {
      // Permission must come from a user gesture — this click is it.
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setBusy(false)
        if (perm === 'denied') {
          setState({ kind: 'denied' })
        }
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast: TS's BufferSource expects Uint8Array<ArrayBuffer> but
        // our helper returns the broader Uint8Array<ArrayBufferLike>.
        // The runtime value is identical; this is purely a type widen.
        applicationServerKey: urlBase64ToUint8Array(
          VAPID_PUBLIC,
        ) as BufferSource,
      })
      const json = sub.toJSON() as {
        endpoint?: string
        keys?: { p256dh?: string; auth?: string }
      }
      const endpoint = json.endpoint || sub.endpoint
      const p256dh = json.keys?.p256dh ?? ''
      const auth = json.keys?.auth ?? ''
      if (!endpoint || !p256dh || !auth) {
        throw new Error('Browser returned an incomplete subscription')
      }
      const fd = new FormData()
      fd.append('endpoint', endpoint)
      fd.append('p256dh', p256dh)
      fd.append('auth', auth)
      fd.append('user_agent', navigator.userAgent || '')
      const result = await subscribePush(fd)
      if (result.error) {
        setMessage(result.error)
        setBusy(false)
        return
      }
      setState({ kind: 'subscribed', endpoint })
      setBusy(false)
    } catch (err: any) {
      setBusy(false)
      setMessage(err?.message ?? 'Could not enable notifications')
    }
  }

  // ─── Disable handler ──────────────────────────────────────────────
  async function handleDisable() {
    if (state.kind !== 'subscribed') return
    setBusy(true)
    setMessage(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
      }
      const fd = new FormData()
      fd.append('endpoint', state.endpoint)
      await unsubscribePush(fd)
      setState({ kind: 'idle' })
      setBusy(false)
    } catch (err: any) {
      setBusy(false)
      setMessage(err?.message ?? 'Could not disable notifications')
    }
  }

  // ─── Test push handler ────────────────────────────────────────────
  async function handleTest() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await sendTestPush()
      setBusy(false)
      if (result.error) {
        setMessage(result.error)
      } else {
        setMessage('Test sent — should arrive in a moment.')
      }
    } catch (err: any) {
      setBusy(false)
      setMessage(err?.message ?? 'Failed to send test')
    }
  }

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className="fg-card p-6">
      <h2 className="fg-section-label" style={{ marginBottom: 8 }}>
        Notifications
      </h2>

      {state.kind === 'loading' && (
        <p
          className="text-sm fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          Loading…
        </p>
      )}

      {state.kind === 'unsupported' && (
        <p
          className="text-sm fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          {state.reason}
        </p>
      )}

      {state.kind === 'needs-install' && (
        <p
          className="text-sm"
          style={{ color: 'var(--color-ink)' }}
        >
          Install Foxgrove on your home screen first (see the section
          above), then open the app from the icon and come back here.
          iOS only allows notifications for installed apps.
        </p>
      )}

      {state.kind === 'denied' && (
        <div className="text-sm" style={{ color: 'var(--color-ink)' }}>
          <p className="mb-2">Notifications are blocked for this app.</p>
          <p className="fg-mono text-xs" style={{ color: 'var(--color-muted)' }}>
            On iPhone: open Settings → Foxgrove → Notifications → Allow.
            <br />
            On desktop: tap the lock icon next to the URL → Notifications →
            Allow.
          </p>
        </div>
      )}

      {state.kind === 'idle' && (
        <>
          <p
            className="text-sm fg-mono mb-3"
            style={{ color: 'var(--color-muted)' }}
          >
            Get a push notification when there's a new task or issue
            you need to see.
          </p>
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="fg-btn-gold"
            style={{ width: 'auto', padding: '8px 18px' }}
          >
            {busy ? 'Enabling…' : 'Enable notifications'}
          </button>
        </>
      )}

      {state.kind === 'subscribed' && (
        <>
          <div
            className="text-sm flex items-center gap-2 mb-4"
            style={{ color: 'var(--color-green)' }}
          >
            <span style={{ fontSize: 20 }}>✓</span>
            <span>Notifications enabled on this device.</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleTest}
              disabled={busy}
              className="fg-btn-ghost text-xs"
              style={{ width: 'auto', padding: '6px 12px' }}
            >
              {busy ? '…' : 'Send test notification'}
            </button>
            <button
              type="button"
              onClick={handleDisable}
              disabled={busy}
              className="fg-btn-ghost text-xs"
              style={{
                width: 'auto',
                padding: '6px 12px',
                color: 'var(--color-red)',
              }}
            >
              Disable
            </button>
          </div>
        </>
      )}

      {message && (
        <p
          className="text-sm fg-mono mt-3"
          style={{ color: 'var(--color-ink)' }}
        >
          {message}
        </p>
      )}
    </div>
  )
}

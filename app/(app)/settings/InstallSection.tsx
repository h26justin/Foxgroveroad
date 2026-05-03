'use client'

import { useState, useEffect } from 'react'

type Platform = 'ios' | 'android' | 'desktop'
type State = {
  platform: Platform
  installed: boolean
}

/**
 * Platform-aware "Install on home screen" instructions. iOS users get
 * Share-sheet-add-to-home-screen steps. Android Chrome shows the install
 * button when available. Desktop visitors get a "open this on your
 * phone" prompt.
 *
 * If the app is already running standalone, shows a confirmation.
 *
 * Detection runs on mount only; no rerender on resize. Good enough for
 * a settings-page card.
 */
export default function InstallSection() {
  const [state, setState] = useState<State | null>(null)

  useEffect(() => {
    const ua = navigator.userAgent || ''
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      // iPadOS 13+ identifies as Mac; check touch points to disambiguate
      (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
    const isAndroid = /Android/.test(ua)
    const platform: Platform = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop'

    // iOS sets navigator.standalone (legacy); modern browsers expose
    // display-mode media query.
    const installed =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true

    setState({ platform, installed })
  }, [])

  // Initial render: don't flicker between states. Show nothing until
  // we know what to display.
  if (!state) {
    return (
      <div className="fg-card p-6">
        <h2 className="fg-section-label" style={{ marginBottom: 8 }}>
          Install on home screen
        </h2>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          Loading…
        </p>
      </div>
    )
  }

  if (state.installed) {
    return (
      <div className="fg-card p-6">
        <h2 className="fg-section-label" style={{ marginBottom: 8 }}>
          Install on home screen
        </h2>
        <div
          className="text-sm flex items-center gap-2"
          style={{ color: 'var(--color-green)' }}
        >
          <span style={{ fontSize: 20 }}>✓</span>
          <span>Foxgrove is installed and running as an app.</span>
        </div>
      </div>
    )
  }

  if (state.platform === 'ios') {
    return (
      <div className="fg-card p-6">
        <h2 className="fg-section-label" style={{ marginBottom: 8 }}>
          Install on home screen
        </h2>
        <p
          className="text-sm fg-mono mb-4"
          style={{ color: 'var(--color-muted)' }}
        >
          Adds a Foxgrove icon to your iPhone home screen. The app opens
          full-screen, just like a regular app.
        </p>
        <ol
          className="text-sm space-y-3"
          style={{ color: 'var(--color-ink)', listStylePosition: 'inside' }}
        >
          <li>
            <strong>Open this page in Safari</strong>
            <span
              className="block fg-mono text-xs mt-1"
              style={{ color: 'var(--color-muted)' }}
            >
              Other browsers (Chrome on iOS) can't install web apps.
            </span>
          </li>
          <li>
            Tap the <strong>Share</strong> button{' '}
            <span style={{ fontSize: 18 }}>􀈂</span> at the bottom of Safari
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>
          </li>
          <li>
            Tap <strong>Add</strong> in the top right
          </li>
        </ol>
      </div>
    )
  }

  if (state.platform === 'android') {
    return (
      <div className="fg-card p-6">
        <h2 className="fg-section-label" style={{ marginBottom: 8 }}>
          Install on home screen
        </h2>
        <p
          className="text-sm fg-mono mb-4"
          style={{ color: 'var(--color-muted)' }}
        >
          Adds a Foxgrove icon to your Android home screen. The app opens
          full-screen.
        </p>
        <ol
          className="text-sm space-y-3"
          style={{ color: 'var(--color-ink)', listStylePosition: 'inside' }}
        >
          <li>
            Open Chrome's menu (three dots, top right)
          </li>
          <li>
            Tap <strong>Install app</strong> or{' '}
            <strong>Add to Home screen</strong>
          </li>
          <li>Confirm</li>
        </ol>
      </div>
    )
  }

  // Desktop
  return (
    <div className="fg-card p-6">
      <h2 className="fg-section-label" style={{ marginBottom: 8 }}>
        Install on home screen
      </h2>
      <p
        className="text-sm fg-mono"
        style={{ color: 'var(--color-muted)' }}
      >
        Open this site on your phone (iPhone Safari or Android Chrome) to
        install it as an app on your home screen. The link is{' '}
        <strong>foxgroveroad.vercel.app</strong>.
      </p>
    </div>
  )
}

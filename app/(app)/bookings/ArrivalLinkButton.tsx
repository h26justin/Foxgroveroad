'use client'

import { useState } from 'react'

export default function ArrivalLinkButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'copied'>('idle')

  async function handleClick() {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const url = `${origin}/arrival/${token}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // No clipboard — fallback: open in a new tab so they can copy
      // from the address bar.
      window.open(url, '_blank')
      return
    }
    setState('copied')
    setTimeout(() => setState('idle'), 1500)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="fg-btn-ghost text-xs"
      style={{ width: 'auto', padding: '6px 12px' }}
      title="Copy a shareable link to the arrival info for this booking"
    >
      {state === 'copied' ? '✓ Copied' : '📋 Share arrival link'}
    </button>
  )
}

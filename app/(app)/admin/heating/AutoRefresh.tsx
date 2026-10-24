'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Re-fetch the heating page every 30s while it's open so new readings
 * and command results from the relay show up without a manual reload.
 * Skips refreshes while the tab is hidden.
 */
export default function AutoRefresh() {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 30_000)
    return () => clearInterval(t)
  }, [router])
  return null
}

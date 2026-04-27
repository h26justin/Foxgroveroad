'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { undoTaskComplete } from './actions'

export default function UndoToast({ completionId }: { completionId: string }) {
  const router = useRouter()
  const [visible, setVisible] = useState(true)
  const [, startTransition] = useTransition()

  useEffect(() => {
    // Auto-dismiss after 10s
    const t = setTimeout(() => setVisible(false), 10_000)
    return () => clearTimeout(t)
  }, [completionId])

  if (!visible || !completionId) return null

  function handleUndo() {
    startTransition(async () => {
      const result = await undoTaskComplete(completionId)
      if (result?.error) {
        router.push(`/today?error=${encodeURIComponent(result.error)}`)
        return
      }
      router.push('/today')
      router.refresh()
    })
  }

  return (
    <div className="fg-toast" role="status" aria-live="polite">
      <span>✓ Marked complete</span>
      <button type="button" onClick={handleUndo} className="fg-toast-undo">
        Undo
      </button>
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completeOneshotTask, deleteOneshotTask, restoreOneshotTask } from './actions'
import AttachmentGallery from '../attachments/AttachmentGallery'
import Toast from '../_toast'
import type { AttachmentWithUrl } from '@/lib/attachments'

export type OneshotTask = {
  id: string
  description: string
  priority: 'normal' | 'urgent'
  room_id: string | null
  room_name: string | null
  created_at: string
  created_by_name: string
  photos: AttachmentWithUrl[]
}

/**
 * Active one-shot tasks. Cleaners see this above the regular
 * housekeeping rota; admin also sees it for context.
 */
export default function OneshotList({
  tasks,
  isAdmin,
  currentUserId,
}: {
  tasks: OneshotTask[]
  isAdmin: boolean
  currentUserId: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // v43: track tasks we've optimistically removed so the UI hides them
  // even before router.refresh fires.
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null)

  const visibleTasks = tasks.filter((t) => !removed.has(t.id))
  if (visibleTasks.length === 0) return null

  async function handleComplete(taskId: string) {
    setError(null)
    setBusy(taskId)
    const r = await completeOneshotTask(taskId)
    setBusy(null)
    if (r.error) {
      setError(r.error)
      return
    }
    startTransition(() => router.refresh())
  }

  // v43: delete is now reversible — no confirm dialog, just optimistic
  // hide + Toast with Undo. Restoring re-inserts the same row id so
  // any attached photos auto-reappear (they're keyed by entity_id).
  function handleDelete(task: OneshotTask) {
    setError(null)
    // Optimistic hide
    setRemoved((s) => new Set(s).add(task.id))
    const snapshot = {
      id: task.id,
      description: task.description,
      priority: task.priority,
      room_id: task.room_id,
      created_at: task.created_at,
    }
    startTransition(async () => {
      const r = await deleteOneshotTask(task.id)
      if (r.error) {
        setRemoved((s) => {
          const next = new Set(s)
          next.delete(task.id)
          return next
        })
        setError(r.error)
        return
      }
      setToast({
        message: `Deleted task`,
        undo: () => {
          setToast(null)
          startTransition(async () => {
            const restoreRes = await restoreOneshotTask(snapshot)
            if (restoreRes.error) {
              setError(restoreRes.error)
              return
            }
            setRemoved((s) => {
              const next = new Set(s)
              next.delete(task.id)
              return next
            })
            router.refresh()
          })
        },
      })
    })
  }

  return (
    <section className="mb-8">
      <h2 className="fg-section-label mb-3">
        One-off tasks ({tasks.length})
      </h2>

      {error && <div className="fg-msg-error mb-3">{error}</div>}

      <div className="space-y-2">
        {visibleTasks.map((t) => {
          const isUrgent = t.priority === 'urgent'
          const isWorking = busy === t.id
          return (
            <div
              key={t.id}
              className="fg-card p-4"
              style={
                isUrgent
                  ? {
                      borderLeftWidth: 4,
                      borderLeftStyle: 'solid',
                      borderLeftColor: 'var(--color-red)',
                    }
                  : undefined
              }
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {isUrgent && (
                      <span
                        className="fg-pill text-xs"
                        style={{
                          background: 'var(--color-red)',
                          color: 'white',
                          fontWeight: 600,
                        }}
                      >
                        ⚠ Urgent
                      </span>
                    )}
                    {t.room_name && (
                      <span
                        className="text-xs fg-mono"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        🛏 {t.room_name}
                      </span>
                    )}
                    {!t.room_name && (
                      <span
                        className="text-xs fg-mono"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        General
                      </span>
                    )}
                  </div>
                  <p
                    className="text-sm whitespace-pre-wrap"
                    style={{ color: 'var(--color-ink)' }}
                  >
                    {t.description}
                  </p>
                  <div
                    className="text-xs fg-mono mt-2"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    Posted by {t.created_by_name} ·{' '}
                    {new Date(t.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleComplete(t.id)}
                    disabled={isWorking}
                    className="fg-btn-gold text-xs"
                    style={{ width: 'auto', padding: '8px 14px' }}
                  >
                    {isWorking ? '…' : '✓ Mark done'}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      disabled={isWorking}
                      className="fg-btn-ghost text-xs"
                      style={{
                        width: 'auto',
                        padding: '4px 10px',
                        color: 'var(--color-muted)',
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {t.photos.length > 0 && (
                <div className="mt-3">
                  <AttachmentGallery
                    attachments={t.photos}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      {toast && (
        <Toast
          message={toast.message}
          onUndo={toast.undo}
          onDismiss={() => setToast(null)}
        />
      )}
    </section>
  )
}

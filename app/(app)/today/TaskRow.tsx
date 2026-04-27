'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markTaskComplete } from './actions'

type TaskStatus = 'overdue' | 'due' | 'scheduled' | 'turnaround' | 'no_schedule'

export default function TaskRow({
  taskId,
  name,
  notes,
  status,
  daysOverdue,
  frequencyDays,
  canTick,
}: {
  taskId: string
  name: string
  notes: string | null
  status: TaskStatus
  daysOverdue: number | null
  frequencyDays: number | null
  canTick: boolean
}) {
  const router = useRouter()
  const [isCompleting, setIsCompleting] = useState(false)
  const [, startTransition] = useTransition()

  const statusClass =
    status === 'overdue'
      ? 'fg-taprow-overdue'
      : status === 'due'
      ? 'fg-taprow-due'
      : 'fg-taprow-scheduled'

  function handleTick() {
    if (isCompleting || !canTick) return
    setIsCompleting(true)

    startTransition(async () => {
      const result = await markTaskComplete(taskId)
      if (result?.error) {
        // Roll the optimistic UI back
        setIsCompleting(false)
        router.push(`/today?error=${encodeURIComponent(result.error)}`)
        return
      }
      // Wait a moment so the user sees the cross-out animation finish, then refresh.
      setTimeout(() => {
        router.push(`/today?done=${result?.completionId ?? ''}`)
        router.refresh()
      }, 350)
    })
  }

  return (
    <div className={`fg-taprow ${statusClass} ${isCompleting ? 'is-completing' : ''}`}>
      {canTick ? (
        <button
          type="button"
          onClick={handleTick}
          className="fg-taprow-check"
          aria-label={`Mark ${name} complete`}
          disabled={isCompleting}
        >
          <span className="fg-taprow-check-circle">
            {isCompleting && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <path d="M5 12l5 5L20 7" />
              </svg>
            )}
          </span>
        </button>
      ) : (
        <div
          className="fg-taprow-check"
          style={{ cursor: 'default', pointerEvents: 'none' }}
          aria-hidden
        >
          <span
            className="fg-taprow-check-circle"
            style={{ borderStyle: 'dashed', opacity: 0.5 }}
          />
        </div>
      )}
      <div className="fg-taprow-body">
        <div className="fg-taprow-name">{name}</div>
        <div className="fg-taprow-meta">
          <span>{describeStatus(status, daysOverdue, frequencyDays)}</span>
          {notes && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ color: 'var(--color-amber)' }} className="truncate">
                {notes.length > 60 ? notes.slice(0, 60) + '…' : notes}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function describeStatus(
  status: TaskStatus,
  daysOverdue: number | null,
  freq: number | null
): string {
  if (status === 'overdue') {
    if (daysOverdue == null) return 'Overdue'
    if (daysOverdue >= 999) return 'Never done'
    if (daysOverdue === 1) return 'Overdue 1 day'
    return `Overdue ${daysOverdue} days`
  }
  if (status === 'due') return 'Due today'
  if (freq) {
    if (freq === 1) return 'Every day'
    if (freq === 7) return 'Every week'
    if (freq % 7 === 0) return `Every ${freq / 7} weeks`
    if (freq % 30 === 0) return `Every ${freq / 30} months`
    return `Every ${freq} days`
  }
  return ''
}

'use client'

import { useState } from 'react'

type TaskStatus = 'overdue' | 'due' | 'scheduled' | 'turnaround' | 'no_schedule'

export default function TaskRow({
  taskId,
  name,
  notes,
  status,
  daysOverdue,
  frequencyDays,
  canTick,
  onTick,
}: {
  taskId: string
  name: string
  notes: string | null
  status: TaskStatus
  daysOverdue: number | null
  frequencyDays: number | null
  canTick: boolean
  onTick: () => void
}) {
  const [isCompleting, setIsCompleting] = useState(false)

  function handleClick() {
    if (isCompleting || !canTick) return
    setIsCompleting(true)
    // Hand off to parent. Parent does the optimistic remove from state
    // after a short delay so the cross-out animation can play.
    setTimeout(() => {
      onTick()
    }, 320)
  }

  return (
    <div className={`fg-taprow${isCompleting ? ' is-completing' : ''}`}>
      {canTick ? (
        <button
          type="button"
          onClick={handleClick}
          className="fg-taprow-check"
          aria-label={`Mark ${name} complete`}
          disabled={isCompleting}
        >
          <span className="fg-taprow-check-circle">
            {isCompleting && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 16, height: 16 }}
              >
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
          <span style={statusColor(status)}>
            {describeStatus(status, daysOverdue, frequencyDays)}
          </span>
          {notes && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span
                style={{ color: 'var(--color-amber)' }}
                className="truncate"
              >
                {notes.length > 60 ? notes.slice(0, 60) + '…' : notes}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function statusColor(status: TaskStatus): React.CSSProperties {
  if (status === 'overdue') return { color: 'var(--color-red)' }
  if (status === 'due') return { color: 'var(--color-amber)' }
  return { color: 'var(--color-muted)' }
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

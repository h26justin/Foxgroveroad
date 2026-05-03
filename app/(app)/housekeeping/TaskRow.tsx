'use client'

import { useState } from 'react'
import { createOneshotTask } from '../oneshots/actions'

type TaskStatus = 'overdue' | 'due' | 'scheduled' | 'turnaround' | 'no_schedule'
type TaskKind = 'turnover' | 'recurring' | 'occupied_only'

export default function TaskRow({
  taskId,
  name,
  notes,
  status,
  daysOverdue,
  frequencyDays,
  taskKind,
  canTick,
  canFlag,
  roomId,
  roomName,
  onTick,
  onFlagged,
}: {
  taskId: string
  name: string
  notes: string | null
  status: TaskStatus
  daysOverdue: number | null
  frequencyDays: number | null
  taskKind: TaskKind
  canTick: boolean
  /** Admin-only: show the "Flag for redo" affordance. */
  canFlag: boolean
  roomId: string | null
  roomName: string | null
  onTick: () => void
  onFlagged?: (msg: string) => void
}) {
  const [isCompleting, setIsCompleting] = useState(false)
  const [flagging, setFlagging] = useState(false)
  const [flagNote, setFlagNote] = useState('')
  const [flagUrgent, setFlagUrgent] = useState(true)
  const [flagBusy, setFlagBusy] = useState(false)
  const [flagError, setFlagError] = useState<string | null>(null)

  function handleClick() {
    if (isCompleting || !canTick) return
    if (flagging) return // don't tick while the flag form is open
    setIsCompleting(true)
    // Hand off to parent. Parent does the optimistic remove from state
    // after a short delay so the cross-out animation can play.
    setTimeout(() => {
      onTick()
    }, 320)
  }

  async function submitFlag() {
    setFlagError(null)
    setFlagBusy(true)
    try {
      const description =
        `Redo: ${name}` + (flagNote.trim() ? ` — ${flagNote.trim()}` : '')
      const fd = new FormData()
      fd.append('description', description)
      if (roomId) fd.append('room_id', roomId)
      fd.append('priority', flagUrgent ? 'urgent' : 'normal')
      const result = await createOneshotTask(fd)
      if (result.error) {
        setFlagError(result.error)
        setFlagBusy(false)
        return
      }
      // Success — close form, reset, surface a toast via parent.
      setFlagging(false)
      setFlagNote('')
      setFlagUrgent(true)
      setFlagBusy(false)
      onFlagged?.(
        flagUrgent
          ? `🚩 Flagged "${name}" as urgent redo`
          : `🚩 Flagged "${name}" for redo`,
      )
    } catch (e: any) {
      setFlagError(e?.message ?? 'Failed to flag task')
      setFlagBusy(false)
    }
  }

  return (
    <div className={`fg-taprow${isCompleting ? ' is-completing' : ''}`}>
      {canTick ? (
        <button
          type="button"
          onClick={handleClick}
          className="fg-taprow-check"
          aria-label={`Mark ${name} complete`}
          disabled={isCompleting || flagging}
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
        <div
          className="fg-taprow-name"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span style={{ flex: 1 }}>
            {name}
            {taskKind === 'turnover' && (
              <span className="fg-taprow-kind-pill fg-taprow-kind-turnover">
                🛎 Turnover
              </span>
            )}
            {taskKind === 'occupied_only' && (
              <span className="fg-taprow-kind-pill fg-taprow-kind-occupied">
                🛏 Guest in room
              </span>
            )}
          </span>
          {canFlag && !flagging && (
            <button
              type="button"
              onClick={() => setFlagging(true)}
              className="fg-btn-ghost"
              style={{
                width: 'auto',
                padding: '2px 8px',
                fontSize: 11,
                color: 'var(--color-amber, #A8862E)',
                flexShrink: 0,
              }}
              title="Flag this task for redo"
            >
              🚩 Flag
            </button>
          )}
        </div>
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

        {/* Inline flag-for-redo form (admin only) */}
        {flagging && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              background: 'var(--color-cream, #F4F3EF)',
              border: '1px solid var(--color-warm)',
              borderRadius: 8,
            }}
          >
            <div
              className="text-xs fg-mono mb-2"
              style={{ color: 'var(--color-muted)' }}
            >
              Flag {roomName ? `"${name}" in ${roomName}` : `"${name}"`} as a
              redo task. The cleaner will see it as a one-off.
            </div>
            <textarea
              value={flagNote}
              onChange={(e) => setFlagNote(e.target.value)}
              className="fg-input"
              rows={2}
              placeholder="Why? (e.g. 'still dusty', 'missed the corners')"
              maxLength={500}
              style={{ width: '100%', fontSize: 13, marginBottom: 8 }}
              disabled={flagBusy}
            />
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                marginBottom: 10,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={flagUrgent}
                onChange={(e) => setFlagUrgent(e.target.checked)}
                disabled={flagBusy}
              />
              <span className="fg-mono" style={{ color: 'var(--color-ink)' }}>
                Mark urgent
              </span>
            </label>
            {flagError && (
              <div className="fg-msg-error mb-2" style={{ fontSize: 12 }}>
                {flagError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={submitFlag}
                disabled={flagBusy}
                className="fg-btn-gold"
                style={{ width: 'auto', padding: '6px 14px', fontSize: 12 }}
              >
                {flagBusy ? 'Flagging…' : 'Flag for redo'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFlagging(false)
                  setFlagNote('')
                  setFlagError(null)
                }}
                disabled={flagBusy}
                className="fg-btn-ghost"
                style={{ width: 'auto', padding: '6px 14px', fontSize: 12 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
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

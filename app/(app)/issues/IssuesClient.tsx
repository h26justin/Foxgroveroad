'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AttachmentGallery from '../attachments/AttachmentGallery'
import ReportIssueButton from './ReportIssueButton'
import { resolveIssue, reopenIssue } from './actions'
import type { AttachmentWithUrl } from '@/lib/attachments'

type Profile = { id: string; full_name: string; role: string }

type Issue = {
  id: string
  created_at: string
  description: string
  status: 'open' | 'resolved'
  resolved_at: string | null
  resolution_note: string | null
  room_id: string | null
  room_name: string
  room_floor: number | null
  created_by: string | null
  creator_name: string
  resolved_by: string | null
  resolver_name: string | null
  photos: AttachmentWithUrl[]
}

export default function IssuesClient({
  profile,
  issues,
  filter,
  openCount,
  resolvedCount,
  rooms,
  savedMessage,
  errorMessage,
}: {
  profile: Profile
  issues: Issue[]
  filter: 'open' | 'resolved'
  openCount: number
  resolvedCount: number
  rooms: { id: string; name: string; floor: number }[]
  savedMessage: string | null
  errorMessage: string | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [resolveModal, setResolveModal] = useState<Issue | null>(null)
  const [resolveNote, setResolveNote] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const isAdmin = profile.role === 'admin'

  async function handleResolveSubmit() {
    if (!resolveModal) return
    setBusy(resolveModal.id)
    setLocalError(null)
    const r = await resolveIssue(resolveModal.id, resolveNote)
    setBusy(null)
    if (r.error) {
      setLocalError(r.error)
      return
    }
    setResolveModal(null)
    setResolveNote('')
    startTransition(() => router.refresh())
  }

  async function handleReopen(issue: Issue) {
    if (!confirm('Reopen this issue?')) return
    setBusy(issue.id)
    setLocalError(null)
    const r = await reopenIssue(issue.id)
    setBusy(null)
    if (r.error) {
      setLocalError(r.error)
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1
            className="text-3xl mb-1"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
          >
            Issues
          </h1>
          <p
            className="text-sm fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            {filter === 'open'
              ? 'Things flagged that need attention'
              : 'Resolved issue history'}
          </p>
        </div>
        <ReportIssueButton
          rooms={rooms}
          buttonLabel="+ Report issue"
          buttonClassName="fg-btn-gold text-xs"
          buttonStyle={{
            color: 'var(--color-ink)',
            textDecoration: 'none',
            padding: '8px 14px',
          }}
        />
      </div>

      {savedMessage && <div className="fg-msg-success mb-4">{savedMessage}</div>}
      {errorMessage && <div className="fg-msg-error mb-4">{errorMessage}</div>}
      {localError && <div className="fg-msg-error mb-4">{localError}</div>}

      {/* Filter toggle */}
      <div className="flex gap-2 mb-4">
        <Link
          href="/issues?filter=open"
          className={
            filter === 'open' ? 'fg-btn-gold' : 'fg-btn-ghost'
          }
          style={{ width: 'auto', padding: '8px 16px' }}
        >
          Open ({openCount})
        </Link>
        <Link
          href="/issues?filter=resolved"
          className={
            filter === 'resolved' ? 'fg-btn-gold' : 'fg-btn-ghost'
          }
          style={{ width: 'auto', padding: '8px 16px' }}
        >
          Resolved ({resolvedCount})
        </Link>
      </div>

      {/* Empty state */}
      {issues.length === 0 && (
        <div className="fg-card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {filter === 'open'
              ? 'No open issues. The house is in good shape.'
              : 'No resolved issues yet.'}
          </p>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {issues.map((issue) => (
          <div key={issue.id} className="fg-card p-4">
            <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className="fg-pill text-xs"
                    style={{
                      background: 'var(--color-warm)',
                      color: 'var(--color-muted)',
                    }}
                  >
                    {issue.room_name}
                  </span>
                  {issue.status === 'open' ? (
                    <span className="fg-pill fg-pill-amber text-xs">⚠ Open</span>
                  ) : (
                    <span className="fg-pill fg-pill-muted text-xs">
                      ✓ Resolved
                    </span>
                  )}
                </div>
                <div
                  className="text-base mb-1"
                  style={{
                    fontFamily: 'var(--font-serif)',
                    color: 'var(--color-ink)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {issue.description}
                </div>
                <div
                  className="text-xs fg-mono"
                  style={{ color: 'var(--color-muted)' }}
                >
                  Reported by {issue.creator_name} ·{' '}
                  {new Date(issue.created_at).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                {issue.status === 'resolved' && (
                  <div
                    className="text-xs fg-mono mt-2 pt-2"
                    style={{
                      color: 'var(--color-muted)',
                      borderTop: '1px solid var(--color-warm)',
                    }}
                  >
                    Resolved by {issue.resolver_name ?? 'Unknown'}
                    {issue.resolved_at && (
                      <>
                        {' '}
                        ·{' '}
                        {new Date(issue.resolved_at).toLocaleString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </>
                    )}
                    {issue.resolution_note && (
                      <div
                        className="mt-1"
                        style={{ color: 'var(--color-ink)' }}
                      >
                        {issue.resolution_note}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              {isAdmin && (
                <div className="flex gap-2 shrink-0">
                  {issue.status === 'open' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setResolveModal(issue)
                        setResolveNote('')
                      }}
                      disabled={busy === issue.id}
                      className="fg-btn-gold text-xs"
                      style={{ width: 'auto', padding: '6px 12px' }}
                    >
                      Mark resolved
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleReopen(issue)}
                      disabled={busy === issue.id}
                      className="fg-btn-ghost text-xs"
                      style={{ width: 'auto', padding: '6px 12px' }}
                    >
                      Reopen
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Photos */}
            {issue.photos.length > 0 && (
              <div className="mt-3">
                <AttachmentGallery
                  attachments={issue.photos}
                  currentUserId={profile.id}
                  isAdmin={isAdmin}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Resolve modal */}
      {resolveModal && (
        <>
          <div
            className="fg-panel-backdrop"
            onClick={() => setResolveModal(null)}
            aria-hidden
          />
          <div className="fg-modal" role="dialog">
            <div className="fg-modal-header">
              <h3
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '18px',
                  color: 'var(--color-ink)',
                }}
              >
                Mark resolved
              </h3>
              <button
                type="button"
                onClick={() => setResolveModal(null)}
                className="fg-panel-close"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="fg-modal-body">
              <div
                className="text-sm mb-3"
                style={{ color: 'var(--color-ink)' }}
              >
                <strong>{resolveModal.room_name}:</strong> {resolveModal.description}
              </div>
              <label className="fg-label">
                Note (optional — what did you do?)
              </label>
              <textarea
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                rows={3}
                className="fg-input"
                placeholder="e.g. Tightened flush handle, ran fine after"
                maxLength={2000}
              />
            </div>
            <div className="fg-modal-footer">
              <button
                type="button"
                onClick={() => setResolveModal(null)}
                className="fg-btn-ghost"
                style={{ width: 'auto', padding: '8px 14px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResolveSubmit}
                disabled={busy === resolveModal.id}
                className="fg-btn-primary"
                style={{ width: 'auto', padding: '8px 18px' }}
              >
                {busy === resolveModal.id ? 'Saving…' : 'Mark resolved'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

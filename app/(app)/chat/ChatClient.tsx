'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { postMessage, softDeleteMessage } from './actions'

type Message = {
  id: string
  body: string
  author_id: string
  author_name: string
  author_role: string
  created_at: string
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const sec = Math.max(0, Math.round((now - then) / 1000))
  if (sec < 45) return 'just now'
  if (sec < 60 * 5) return `${Math.round(sec / 60)} min ago`
  if (sec < 60 * 60)
    return `${Math.round(sec / 60)} min ago`
  if (sec < 60 * 60 * 24)
    return `${Math.round(sec / 3600)} hr ago`
  if (sec < 60 * 60 * 24 * 7)
    return `${Math.round(sec / (3600 * 24))} d ago`
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

function fullTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ROLE_ICON: Record<string, string> = {
  admin: '👑',
  family: '🏡',
  cleaner: '🧹',
}

export default function ChatClient({
  messages,
  currentUserId,
  isAdmin,
}: {
  messages: Message[]
  currentUserId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Refresh every 30s so new posts from others show up without manual
  // reload. Cheap because the server route is cached.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(t)
  }, [router])

  function submit() {
    if (!body.trim()) return
    setBusy(true)
    setError(null)
    const fd = new FormData()
    fd.set('body', body.trim())
    fd.set('scope', 'general')
    startTransition(async () => {
      const r = await postMessage(fd)
      setBusy(false)
      if (r.error) {
        setError(r.error)
        return
      }
      setBody('')
      router.refresh()
      // Keep focus on the input for rapid posting
      textareaRef.current?.focus()
    })
  }

  function handleDelete(id: string) {
    setBusy(true)
    startTransition(async () => {
      const r = await softDeleteMessage(id)
      setBusy(false)
      if (r.error) {
        setError(r.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1
          className="text-3xl mb-1"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          House chat
        </h1>
        <p
          className="text-sm fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          One thread for the whole house. Refreshes automatically every 30s.
        </p>
      </div>

      {/* Compose */}
      <div className="fg-card p-4 mb-6">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl + Enter submits
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          rows={3}
          maxLength={2000}
          placeholder="Anything to say to the house?"
          className="fg-input"
          disabled={busy}
        />
        <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
          <div
            className="text-xs fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            {body.length > 0 ? `${body.length}/2000 · ⌘+Enter to post` : ''}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !body.trim()}
            className="fg-btn-primary"
            style={{ width: 'auto', padding: '8px 18px' }}
          >
            {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
        {error && <div className="fg-msg-error mt-2">{error}</div>}
      </div>

      {/* Thread */}
      {messages.length === 0 ? (
        <div
          className="fg-card p-8 text-center"
          style={{ color: 'var(--color-muted)' }}
        >
          Nothing here yet — start the conversation.
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => {
            const isMine = m.author_id === currentUserId
            const canDelete = isMine || isAdmin
            return (
              <div
                key={m.id}
                className="fg-card p-3"
                style={
                  isMine
                    ? {
                        borderLeftWidth: 4,
                        borderLeftStyle: 'solid',
                        borderLeftColor: 'var(--color-gold)',
                      }
                    : undefined
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs fg-mono mb-1 flex items-center gap-2 flex-wrap">
                      <span
                        aria-hidden
                        style={{ fontSize: 12, lineHeight: 1 }}
                      >
                        {ROLE_ICON[m.author_role] ?? '🏡'}
                      </span>
                      <strong style={{ color: 'var(--color-ink)' }}>
                        {m.author_name}
                        {isMine && ' (you)'}
                      </strong>
                      <span
                        title={fullTime(m.created_at)}
                        style={{ color: 'var(--color-muted)' }}
                      >
                        {timeAgo(m.created_at)}
                      </span>
                    </div>
                    <div
                      className="text-sm whitespace-pre-wrap break-words"
                      style={{ color: 'var(--color-ink)' }}
                    >
                      {m.body}
                    </div>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(m.id)}
                      disabled={busy}
                      aria-label="Delete message"
                      className="text-xs fg-mono shrink-0"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-muted)',
                        padding: '2px 6px',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

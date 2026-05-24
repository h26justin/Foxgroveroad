'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updatePage, deletePage } from '../actions'

export default function WikiPageActions({
  id,
  slug,
  title,
  body,
  isPinned,
}: {
  id: string
  slug: string
  title: string
  body: string
  isPinned: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(title)
  const [draftBody, setDraftBody] = useState(body)
  const [draftPinned, setDraftPinned] = useState(isPinned)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!editing) {
    return (
      <div className="flex gap-2 items-baseline">
        <button
          type="button"
          onClick={() => {
            setEditing(true)
            setError(null)
          }}
          className="fg-btn-ghost text-xs"
          style={{ width: 'auto', padding: '6px 12px' }}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            if (!confirm('Delete this page? This cannot be undone.')) return
            setBusy(true)
            startTransition(async () => {
              const r = await deletePage(id)
              setBusy(false)
              if (r?.error) {
                setError(r.error)
                return
              }
              // deletePage redirects to /wiki
            })
          }}
          disabled={busy}
          className="fg-btn-ghost text-xs"
          style={{
            width: 'auto',
            padding: '6px 12px',
            color: 'var(--color-red)',
          }}
        >
          Delete
        </button>
      </div>
    )
  }

  return (
    <form
      className="fg-card p-5 my-4 w-full space-y-3"
      style={{ flexBasis: '100%' }}
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        fd.set('id', id)
        setBusy(true)
        setError(null)
        startTransition(async () => {
          const r = await updatePage(fd)
          setBusy(false)
          if (r.error) {
            setError(r.error)
            return
          }
          setEditing(false)
          if (r.slug && r.slug !== slug) {
            router.push(`/wiki/${r.slug}`)
          } else {
            router.refresh()
          }
        })
      }}
    >
      <div>
        <label className="fg-label">Title</label>
        <input
          name="title"
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          required
          maxLength={200}
          className="fg-input"
        />
      </div>
      <div>
        <label className="fg-label">Body</label>
        <textarea
          name="body"
          rows={14}
          value={draftBody}
          onChange={(e) => setDraftBody(e.target.value)}
          className="fg-input"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
          placeholder="Use # for headings, - for bullets, 1. for numbered lists. URLs auto-link."
        />
        <p
          className="text-xs fg-mono mt-1"
          style={{ color: 'var(--color-muted)' }}
        >
          Tips: `# Heading`, `## Sub-heading`, `- bullet`, `1. numbered`, blank
          line for paragraph break. Plain URLs auto-link.
        </p>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          name="is_pinned"
          value="1"
          checked={draftPinned}
          onChange={(e) => setDraftPinned(e.target.checked)}
        />
        <span className="text-sm">Pin to top of the list</span>
      </label>
      {error && <div className="fg-msg-error">{error}</div>}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="fg-btn-primary"
          style={{ width: 'auto', padding: '8px 18px' }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false)
            setDraftTitle(title)
            setDraftBody(body)
            setDraftPinned(isPinned)
            setError(null)
          }}
          disabled={busy}
          className="fg-btn-ghost"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

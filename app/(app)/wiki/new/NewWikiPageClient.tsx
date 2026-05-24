'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPage } from '../actions'

export default function NewWikiPageClient() {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="fg-card p-5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        setBusy(true)
        setError(null)
        startTransition(async () => {
          const r = await createPage(fd)
          setBusy(false)
          if (r.error) {
            setError(r.error)
            return
          }
          if (r.slug) router.push(`/wiki/${r.slug}`)
        })
      }}
    >
      <div>
        <label className="fg-label">Title</label>
        <input
          name="title"
          type="text"
          required
          maxLength={200}
          placeholder="How to reset the boiler"
          className="fg-input"
          autoFocus
        />
        <p
          className="text-xs fg-mono mt-1"
          style={{ color: 'var(--color-muted)' }}
        >
          The URL slug is generated from the title automatically.
        </p>
      </div>
      <div>
        <label className="fg-label">Body</label>
        <textarea
          name="body"
          rows={14}
          className="fg-input"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
          placeholder={`# Quick steps\n\n1. Turn off the boiler at the wall switch.\n2. Wait 30 seconds.\n3. Turn it back on.\n\n## Notes\n- The boiler is in the cupboard under the stairs.\n- If the pressure is below 1 bar, top it up using the filling loop.\n\nManufacturer guide: https://example.com/boiler-manual.pdf`}
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
        <input type="checkbox" name="is_pinned" value="1" />
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
          {busy ? 'Saving…' : 'Create page'}
        </button>
      </div>
    </form>
  )
}

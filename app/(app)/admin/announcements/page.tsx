import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAnnouncement, deactivateAnnouncement } from './actions'

export const revalidate = 30

export default async function AnnouncementsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const [, sp, supabase] = await Promise.all([
    requireAdmin(),
    searchParams,
    createClient(),
  ])
  const { saved, error } = sp

  const { data: announcements } = await supabase
    .from('announcements')
    .select('id, body, is_active, dismissible, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  const rows = (announcements as any[]) ?? []
  const active = rows.find((r) => r.is_active)

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <Link
          href="/admin/team"
          className="text-sm fg-mono mb-2 inline-block"
          style={{ color: 'var(--color-muted)' }}
        >
          ← Back to admin
        </Link>
        <h1
          className="text-3xl mb-2"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
        >
          Announcements
        </h1>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          Post a short note that appears as a banner at the top of every
          page for every user. One active banner at a time — posting a
          new one retires the previous one.
        </p>
      </div>

      {saved && <div className="fg-msg-success mb-6">{saved}</div>}
      {error && <div className="fg-msg-error mb-6">{error}</div>}

      <form action={createAnnouncement} className="fg-card p-6 space-y-4 mb-8">
        <div>
          <label htmlFor="body" className="fg-label">
            Message
          </label>
          <textarea
            id="body"
            name="body"
            rows={3}
            maxLength={500}
            required
            placeholder="Boiler being serviced Tuesday afternoon — hot water may be off for an hour."
            className="fg-input"
          />
          <p
            className="text-xs fg-mono mt-1"
            style={{ color: 'var(--color-muted)' }}
          >
            Max 500 characters.
          </p>
        </div>

        <label className="fg-radio-row" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="checkbox" name="dismissible" value="1" defaultChecked />
          <span className="text-sm">Users can dismiss it</span>
        </label>

        <div className="pt-2">
          <button type="submit" className="fg-btn-primary">
            Post announcement
          </button>
        </div>
      </form>

      {active && (
        <div className="mb-8">
          <h2 className="fg-section-label">Currently active</h2>
          <div className="fg-card p-4 mt-2" style={{ borderLeft: '4px solid var(--color-amber, #d97706)' }}>
            <div className="text-sm mb-3" style={{ color: 'var(--color-ink)' }}>
              {active.body}
            </div>
            <form action={deactivateAnnouncement}>
              <input type="hidden" name="id" value={active.id} />
              <button type="submit" className="fg-btn-secondary text-xs">
                Retire
              </button>
            </form>
          </div>
        </div>
      )}

      <div>
        <h2 className="fg-section-label">Recent</h2>
        <div className="space-y-2 mt-2">
          {rows.filter((r) => !r.is_active).slice(0, 10).map((r) => (
            <div key={r.id} className="fg-card p-3 text-sm">
              <div
                className="text-xs fg-mono mb-1"
                style={{ color: 'var(--color-muted)' }}
              >
                {new Date(r.created_at).toLocaleString()}
              </div>
              <div style={{ color: 'var(--color-ink)' }}>{r.body}</div>
            </div>
          ))}
          {rows.filter((r) => !r.is_active).length === 0 && (
            <p className="text-xs fg-mono" style={{ color: 'var(--color-muted)' }}>
              No retired announcements yet.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

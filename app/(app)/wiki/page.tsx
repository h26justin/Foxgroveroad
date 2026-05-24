import Link from 'next/link'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getUserPrefs } from '@/lib/user-prefs'
import { redirect } from 'next/navigation'

export const revalidate = 60

export default async function WikiIndexPage() {
  const [profile, supabase] = await Promise.all([
    requireProfile(),
    createClient(),
  ])

  const prefs = await getUserPrefs(profile.id)
  if (!prefs.show_wiki) redirect('/dashboard')

  const { data: rows } = await supabase
    .from('wiki_pages')
    .select('id, slug, title, is_pinned, updated_at, updated_by, updater:profiles!wiki_pages_updated_by_fkey(full_name)')
    .order('is_pinned', { ascending: false })
    .order('title')

  const pages = ((rows as any[]) ?? []).map((p) => ({
    id: p.id as string,
    slug: p.slug as string,
    title: p.title as string,
    is_pinned: !!p.is_pinned,
    updated_at: p.updated_at as string,
    updater_name: (p.updater as any)?.full_name ?? null,
  }))

  const isAdmin = profile.role === 'admin'

  return (
    <div className="max-w-2xl">
      <div className="flex items-baseline justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1
            className="text-3xl mb-1"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            House info
          </h1>
          <p
            className="text-sm fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            How to do things in the house. Boiler, alarm, wifi quirks.
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/wiki/new"
            className="fg-btn-gold text-xs"
            style={{ width: 'auto', padding: '8px 14px' }}
          >
            + New page
          </Link>
        )}
      </div>

      {pages.length === 0 ? (
        <div
          className="fg-card p-8 text-center"
          style={{ color: 'var(--color-muted)' }}
        >
          {isAdmin
            ? 'No pages yet. Click "+ New page" to add your first how-to.'
            : "Nothing here yet. Ask the admin to add a how-to."}
        </div>
      ) : (
        <div className="space-y-2">
          {pages.map((p) => (
            <Link
              key={p.id}
              href={`/wiki/${p.slug}`}
              className="fg-card p-4 block"
              style={
                p.is_pinned
                  ? {
                      borderLeftWidth: 4,
                      borderLeftStyle: 'solid',
                      borderLeftColor: 'var(--color-gold)',
                    }
                  : undefined
              }
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className="text-base"
                  style={{
                    fontFamily: 'var(--font-serif)',
                    color: 'var(--color-ink)',
                  }}
                >
                  {p.is_pinned && (
                    <span
                      style={{
                        color: 'var(--color-gold)',
                        marginRight: 6,
                        fontSize: 11,
                      }}
                      title="Pinned"
                    >
                      ★
                    </span>
                  )}
                  {p.title}
                </span>
                <span
                  className="text-xs fg-mono shrink-0"
                  style={{ color: 'var(--color-muted)' }}
                >
                  Updated{' '}
                  {new Date(p.updated_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

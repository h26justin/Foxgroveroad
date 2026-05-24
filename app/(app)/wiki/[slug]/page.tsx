import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { renderWikiBody } from '@/lib/wiki-render'
import WikiPageActions from './WikiPageActions'

export const revalidate = 60

export default async function WikiPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const [profile, supabase, { slug }] = await Promise.all([
    requireProfile(),
    createClient(),
    params,
  ])

  const { data: page } = await supabase
    .from('wiki_pages')
    .select(
      'id, slug, title, body, is_pinned, updated_at, updated_by, updater:profiles!wiki_pages_updated_by_fkey(full_name)',
    )
    .eq('slug', slug)
    .maybeSingle()

  if (!page) notFound()
  const p = page as any
  const isAdmin = profile.role === 'admin'
  const updaterName = (p.updater as any)?.full_name ?? null

  return (
    <div className="max-w-2xl">
      <div className="mb-2">
        <Link
          href="/wiki"
          className="text-xs fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          ← Back to House info
        </Link>
      </div>

      <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
        <h1
          className="text-3xl"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          {p.is_pinned && (
            <span
              style={{
                color: 'var(--color-gold)',
                marginRight: 8,
                fontSize: 18,
              }}
              title="Pinned"
            >
              ★
            </span>
          )}
          {p.title}
        </h1>
        {isAdmin && (
          <WikiPageActions
            id={p.id}
            slug={p.slug}
            title={p.title}
            body={p.body}
            isPinned={p.is_pinned}
          />
        )}
      </div>

      <div
        className="text-xs fg-mono mb-6"
        style={{ color: 'var(--color-muted)' }}
      >
        Updated{' '}
        {new Date(p.updated_at).toLocaleString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
        {updaterName && <> · by {updaterName}</>}
      </div>

      <article className="fg-card p-6">{renderWikiBody(p.body)}</article>
    </div>
  )
}

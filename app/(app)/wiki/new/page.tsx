import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import NewWikiPageClient from './NewWikiPageClient'

export default async function NewWikiPage() {
  const profile = await requireProfile()
  if (profile.role !== 'admin') redirect('/wiki')

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
      <h1
        className="text-3xl mb-4"
        style={{
          fontFamily: 'var(--font-serif)',
          color: 'var(--color-ink)',
        }}
      >
        New how-to page
      </h1>
      <NewWikiPageClient />
    </div>
  )
}

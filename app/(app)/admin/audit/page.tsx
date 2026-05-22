import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const revalidate = 30

const ACTION_LABELS: Record<string, string> = {
  'user.role.update': 'Role changed',
  'user.ban.toggle': 'Account disabled/re-enabled',
  'user.delete': 'User deleted',
  'user.email.update': 'Email rotated',
  'user.approve_pending': 'Pending user approved',
  'booking.approve': 'Booking approved',
  'booking.decline': 'Booking declined',
  'booking.cancel': 'Booking cancelled',
  'booking.delete_permanently': 'Booking permanently deleted',
  'announcement.create': 'Announcement posted',
  'announcement.retire': 'Announcement retired',
}

const ACTION_ICONS: Record<string, string> = {
  'user.role.update': '👤',
  'user.ban.toggle': '🚫',
  'user.delete': '🗑',
  'user.email.update': '✉️',
  'user.approve_pending': '✅',
  'booking.approve': '👍',
  'booking.decline': '👎',
  'booking.cancel': '↩',
  'booking.delete_permanently': '🗑',
  'announcement.create': '📣',
  'announcement.retire': '🔕',
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>
}) {
  const [, sp, supabase] = await Promise.all([
    requireAdmin(),
    searchParams,
    createClient(),
  ])
  const filter = sp.action ?? null

  // Pull last 200 events, optionally filtered by action.
  let query = supabase
    .from('admin_audit')
    .select(
      'id, actor_id, action, target_kind, target_id, payload, created_at, actor:profiles!admin_audit_actor_id_fkey(full_name)',
    )
    .order('created_at', { ascending: false })
    .limit(200)
  if (filter) query = query.eq('action', filter)

  const { data: events } = await query
  const rows = (events as any[]) ?? []

  const allActions = Array.from(
    new Set(rows.map((r) => r.action as string)),
  ).sort()

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
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
          Audit log
        </h1>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          Append-only record of destructive or sensitive admin actions.
          Most recent first. Limited to 200 events.
        </p>
      </div>

      {allActions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <Link
            href="/admin/audit"
            className="fg-btn-ghost text-xs"
            style={{
              padding: '4px 10px',
              minHeight: 0,
              fontWeight: filter === null ? 600 : 400,
            }}
          >
            All
          </Link>
          {allActions.map((a) => (
            <Link
              key={a}
              href={`/admin/audit?action=${encodeURIComponent(a)}`}
              className="fg-btn-ghost text-xs"
              style={{
                padding: '4px 10px',
                minHeight: 0,
                fontWeight: filter === a ? 600 : 400,
              }}
            >
              {ACTION_LABELS[a] ?? a}
            </Link>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs fg-mono" style={{ color: 'var(--color-muted)' }}>
          No events yet. Admin actions logged from now on will appear here.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const actorName = (r.actor as any)?.full_name ?? 'Unknown actor'
            const label = ACTION_LABELS[r.action] ?? r.action
            const icon = ACTION_ICONS[r.action] ?? '•'
            const payload = r.payload ?? {}
            const payloadEntries = Object.entries(payload).filter(
              ([, v]) => v !== null && v !== '',
            )
            return (
              <div key={r.id} className="fg-card p-3 text-sm">
                <div className="flex items-start gap-3">
                  <span aria-hidden style={{ fontSize: 16, lineHeight: '1.4em' }}>
                    {icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div style={{ color: 'var(--color-ink)' }}>
                      <span style={{ fontWeight: 600 }}>{actorName}</span>{' '}
                      — {label}
                    </div>
                    {payloadEntries.length > 0 && (
                      <div
                        className="text-xs fg-mono mt-1"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        {payloadEntries.map(([k, v]) => (
                          <span key={k} className="mr-3">
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div
                      className="text-xs fg-mono mt-1"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {new Date(r.created_at).toLocaleString()}
                      {r.target_id && (
                        <>
                          {' · '}
                          target {r.target_kind ?? '?'}: {r.target_id.slice(0, 8)}…
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

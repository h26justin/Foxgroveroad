import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { setUserRole, toggleCleanerActive, linkCleanerProfile } from './actions'
import InvitePersonForm from './InvitePersonForm'
import UserActionsRow from './UserActionsRow'

export default async function AdminTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const [me, sp, supabase] = await Promise.all([
    requireAdmin(),
    searchParams,
    createClient(),
  ])
  const { saved, error } = sp

  const [profilesRes, cleanersRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, role, phone, created_at')
      .order('created_at', { ascending: true }),
    supabase
      .from('cleaners')
      .select(
        'id, name, is_active, profile_id, profiles:profiles!cleaners_profile_id_fkey(full_name)'
      )
      .order('name'),
  ])
  const profiles = profilesRes.data
  const cleaners = cleanersRes.data

  // Enrich profiles with email + last_sign_in_at + banned state from
  // auth.users (only readable via service-role admin client).
  const authMeta = new Map<
    string,
    { email: string | null; lastSignIn: string | null; banned: boolean }
  >()
  try {
    const admin = createAdminClient()
    // listUsers is paginated; default is 50 per page which is plenty
    // for this house. Bump perPage if you ever invite more.
    const { data: usersPage } = await admin.auth.admin.listUsers({
      perPage: 200,
    })
    for (const u of usersPage?.users ?? []) {
      const banned =
        !!(u as any).banned_until &&
        new Date((u as any).banned_until).getTime() > Date.now()
      authMeta.set(u.id, {
        email: u.email ?? null,
        lastSignIn: (u as any).last_sign_in_at ?? null,
        banned,
      })
    }
  } catch (err) {
    // If the admin client throws (missing service role key, etc.) we
    // still render the page with the data we have. The action buttons
    // will explain themselves with a missing-email tooltip.
    console.error('Failed to load auth metadata:', err)
  }

  // Profiles that could potentially be linked to a cleaner record
  const linkableProfiles = (profiles ?? []).filter(
    (p) => p.role === 'cleaner' || p.role === 'family'
  )

  function fmtRelative(iso: string | null): string {
    if (!iso) return 'never'
    const ms = Date.now() - new Date(iso).getTime()
    const days = Math.floor(ms / 86400000)
    if (days < 1) return 'today'
    if (days === 1) return 'yesterday'
    if (days < 7) return `${days}d ago`
    if (days < 30) return `${Math.floor(days / 7)}w ago`
    if (days < 365) return `${Math.floor(days / 30)}mo ago`
    return `${Math.floor(days / 365)}y ago`
  }

  return (
    <div>
      <div className="mb-8 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-3xl mb-2"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            Team
          </h1>
          <p
            className="text-sm fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            Manage who has access and what role they have.
          </p>
        </div>
        <a
          href="/admin/features"
          className="fg-btn-ghost text-xs"
          style={{ width: 'auto', padding: '8px 14px' }}
        >
          Features →
        </a>
      </div>

      {saved && (
        <div className="fg-msg-success mb-6">
          {saved === '1' ? 'Saved.' : saved}
        </div>
      )}
      {error && <div className="fg-msg-error mb-6">{error}</div>}

      <InvitePersonForm />

      {/* People */}
      <section className="mb-12">
        <h2 className="fg-section-label mb-3">People with accounts</h2>
        <div className="space-y-3">
          {(profiles ?? []).map((p) => {
            const meta = authMeta.get(p.id) ?? {
              email: null,
              lastSignIn: null,
              banned: false,
            }
            const isMe = p.id === me.id
            return (
              <div
                key={p.id}
                className="fg-card p-5"
                style={
                  meta.banned
                    ? {
                        borderLeftWidth: 4,
                        borderLeftStyle: 'solid',
                        borderLeftColor: 'var(--color-red)',
                      }
                    : undefined
                }
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-base"
                        style={{
                          fontFamily: 'var(--font-serif)',
                          color: 'var(--color-ink)',
                        }}
                      >
                        {p.full_name}
                      </span>
                      {isMe && (
                        <span className="fg-pill fg-pill-blue text-xs">
                          you
                        </span>
                      )}
                      {meta.banned && (
                        <span
                          className="fg-pill text-xs"
                          style={{
                            background: 'var(--color-red)',
                            color: 'white',
                          }}
                        >
                          disabled
                        </span>
                      )}
                    </div>
                    <div
                      className="text-xs fg-mono mt-1"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {p.role}
                      {meta.email && ` · ${meta.email}`}
                      {p.phone && ` · ${p.phone}`}
                    </div>
                    <div
                      className="text-xs fg-mono mt-1"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      Last signed in: {fmtRelative(meta.lastSignIn)}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-3">
                    {!isMe && (
                      <form
                        action={setUserRole}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="hidden"
                          name="profile_id"
                          value={p.id}
                        />
                        <select
                          name="role"
                          defaultValue={p.role}
                          className="fg-input text-sm"
                          style={{ padding: '6px 10px', minWidth: 110 }}
                        >
                          <option value="family">family</option>
                          <option value="cleaner">cleaner</option>
                          <option value="admin">admin</option>
                        </select>
                        <button
                          type="submit"
                          className="fg-btn-ghost text-sm"
                        >
                          Update
                        </button>
                      </form>
                    )}
                    <UserActionsRow
                      profileId={p.id}
                      fullName={p.full_name}
                      email={meta.email}
                      isMe={isMe}
                      isBanned={meta.banned}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Cleaners */}
      <section>
        <h2 className="fg-section-label mb-3">Cleaners (rota names)</h2>
        <p
          className="text-xs fg-mono mb-4"
          style={{ color: 'var(--color-muted)' }}
        >
          These names appear on cleaning schedules. Once a cleaner signs up,
          link them to their account so they can access the cleaner view.
        </p>
        <div className="space-y-3">
          {(cleaners ?? []).map((c: any) => (
            <div key={c.id} className="fg-card p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div
                    className="text-base"
                    style={{
                      fontFamily: 'var(--font-serif)',
                      color: 'var(--color-ink)',
                    }}
                  >
                    {c.name}
                  </div>
                  <div
                    className="text-xs fg-mono mt-1"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {c.profile_id
                      ? `linked to: ${(c.profiles as any)?.full_name ?? '—'}`
                      : 'not linked to an account yet'}
                    {' · '}
                    {c.is_active ? 'active' : 'inactive'}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <form action={linkCleanerProfile} className="flex gap-2">
                    <input type="hidden" name="cleaner_id" value={c.id} />
                    <select
                      name="profile_id"
                      defaultValue={c.profile_id ?? ''}
                      className="fg-input text-sm"
                      style={{ padding: '6px 10px', minWidth: 160 }}
                    >
                      <option value="">— not linked —</option>
                      {linkableProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="fg-btn-ghost text-sm">
                      Link
                    </button>
                  </form>

                  <form action={toggleCleanerActive}>
                    <input type="hidden" name="cleaner_id" value={c.id} />
                    <input
                      type="hidden"
                      name="is_active"
                      value={c.is_active ? 'false' : 'true'}
                    />
                    <button
                      type="submit"
                      className="fg-btn-ghost text-sm"
                      title={c.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {c.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

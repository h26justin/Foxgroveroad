import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { setUserRole, toggleCleanerActive, linkCleanerProfile } from './actions'

export default async function AdminTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const me = await requireAdmin()
  const { saved, error } = await searchParams
  const supabase = await createClient()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role, phone, created_at')
    .order('created_at', { ascending: true })

  const { data: cleaners } = await supabase
    .from('cleaners')
    .select(
      'id, name, is_active, profile_id, profiles:profiles!cleaners_profile_id_fkey(full_name)'
    )
    .order('name')

  // Profiles that could potentially be linked to a cleaner record
  const linkableProfiles = (profiles ?? []).filter(
    (p) => p.role === 'cleaner' || p.role === 'family'
  )

  return (
    <div>
      <div className="mb-8">
        <h1
          className="text-3xl mb-2"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
        >
          Team
        </h1>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          Manage who has access and what role they have.
        </p>
      </div>

      {saved && <div className="fg-msg-success mb-6">Saved.</div>}
      {error && <div className="fg-msg-error mb-6">{error}</div>}

      {/* People */}
      <section className="mb-12">
        <h2 className="fg-section-label mb-3">People with accounts</h2>
        <div className="space-y-3">
          {(profiles ?? []).map((p) => (
            <div key={p.id} className="fg-card p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-base"
                      style={{
                        fontFamily: 'var(--font-serif)',
                        color: 'var(--color-ink)',
                      }}
                    >
                      {p.full_name}
                    </span>
                    {p.id === me.id && (
                      <span className="fg-pill fg-pill-blue text-xs">you</span>
                    )}
                  </div>
                  <div
                    className="text-xs fg-mono mt-1"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {p.role}
                    {p.phone && ` · ${p.phone}`}
                  </div>
                </div>

                {p.id !== me.id && (
                  <form
                    action={setUserRole}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="profile_id" value={p.id} />
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
                    <button type="submit" className="fg-btn-ghost text-sm">
                      Update
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
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

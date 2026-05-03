import { requireAdmin } from '@/lib/auth'
import { FEATURES, getFeatureFlags } from '@/lib/feature-flags'
import { setFeatureFlag } from './actions'

export default async function FeaturesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const [, sp, flags] = await Promise.all([
    requireAdmin(),
    searchParams,
    getFeatureFlags(),
  ])

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1
          className="text-3xl mb-2"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
        >
          Features
        </h1>
        <p
          className="text-sm fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          Turn parts of the app on or off. Disabled features are hidden
          for everyone (including admins). Data is preserved — flipping
          a toggle back on restores access without any loss.
        </p>
      </div>

      {sp.saved && <div className="fg-msg-success mb-6">Saved.</div>}
      {sp.error && <div className="fg-msg-error mb-6">{sp.error}</div>}

      <div className="space-y-3">
        {FEATURES.map((feat) => {
          const enabled = flags[feat.name] !== false
          return (
            <div key={feat.name} className="fg-card p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className="text-base"
                      style={{
                        fontFamily: 'var(--font-serif)',
                        color: 'var(--color-ink)',
                      }}
                    >
                      {feat.label}
                    </span>
                    {enabled ? (
                      <span
                        className="fg-pill text-xs"
                        style={{
                          background: 'var(--color-green)',
                          color: 'white',
                        }}
                      >
                        on
                      </span>
                    ) : (
                      <span
                        className="fg-pill text-xs"
                        style={{
                          background: 'var(--color-warm)',
                          color: 'var(--color-muted)',
                        }}
                      >
                        off
                      </span>
                    )}
                  </div>
                  <p
                    className="text-sm fg-mono"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {feat.description}
                  </p>
                </div>
                <form
                  action={setFeatureFlag}
                  className="flex items-center shrink-0"
                >
                  <input type="hidden" name="name" value={feat.name} />
                  <input
                    type="hidden"
                    name="enabled"
                    value={enabled ? 'false' : 'true'}
                  />
                  <button
                    type="submit"
                    className={enabled ? 'fg-btn-ghost' : 'fg-btn-gold'}
                    style={{
                      width: 'auto',
                      padding: '8px 16px',
                      fontSize: 13,
                      ...(enabled
                        ? { color: 'var(--color-red)' }
                        : {}),
                    }}
                  >
                    {enabled ? 'Turn off' : 'Turn on'}
                  </button>
                </form>
              </div>
            </div>
          )
        })}
      </div>

      <p
        className="text-xs fg-mono mt-6"
        style={{ color: 'var(--color-muted)' }}
      >
        Note: turning a feature off hides its tab in the top navigation.
        If a user is currently on a disabled page they'll be sent to the
        Housekeeping page on their next click.
      </p>
    </div>
  )
}

import { requireProfile } from '@/lib/auth'
import { updateProfile, updateAccessibilityMode } from './actions'
import InstallSection from './InstallSection'
import PushNotificationsSection from './PushNotificationsSection'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const [profile, sp] = await Promise.all([requireProfile(), searchParams])
  const { saved, error } = sp
  const accMode = (profile as any).accessibility_mode ?? 'normal'

  return (
    <div className="max-w-xl">
      <div className="mb-8">
        <h1
          className="text-3xl mb-2"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
        >
          Settings
        </h1>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          Update your profile and display preferences.
        </p>
      </div>

      {saved && <div className="fg-msg-success mb-6">Saved.</div>}
      {error && <div className="fg-msg-error mb-6">{error}</div>}

      <form action={updateProfile} className="fg-card p-6 space-y-5 mb-6">
        <h2 className="fg-section-label" style={{ marginBottom: 0 }}>
          Profile
        </h2>
        <div>
          <label htmlFor="full_name" className="fg-label">
            Full name
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            maxLength={80}
            defaultValue={profile.full_name}
            className="fg-input"
          />
        </div>

        <div>
          <label htmlFor="phone" className="fg-label">
            Phone <span style={{ color: 'var(--color-muted)' }}>(optional)</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder="+44 ..."
            maxLength={30}
            defaultValue={profile.phone ?? ''}
            className="fg-input"
          />
        </div>

        <div>
          <label className="fg-label">Role</label>
          <div
            className="text-sm py-2 px-3 rounded fg-mono"
            style={{
              background: 'var(--color-cream)',
              color: 'var(--color-muted)',
            }}
          >
            {profile.role}
            <span className="ml-2 text-xs">
              · changeable only by an admin
            </span>
          </div>
        </div>

        <div className="pt-2">
          <button type="submit" className="fg-btn-primary">
            Save profile
          </button>
        </div>
      </form>

      <form action={updateAccessibilityMode} className="fg-card p-6 space-y-4">
        <h2 className="fg-section-label" style={{ marginBottom: 0 }}>
          Display
        </h2>
        <p
          className="text-xs fg-mono"
          style={{ color: 'var(--color-muted)' }}
        >
          Make text larger across the app — useful for phones in
          hallways or if regular size is hard to read.
        </p>
        <div className="space-y-2">
          <label
            className="fg-radio-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              border: '1px solid var(--color-warm)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="accessibility_mode"
              value="normal"
              defaultChecked={accMode === 'normal'}
            />
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--color-ink)',
                }}
              >
                Normal text
              </div>
              <div
                className="text-xs fg-mono"
                style={{ color: 'var(--color-muted)' }}
              >
                Default size
              </div>
            </div>
          </label>
          <label
            className="fg-radio-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              border: '1px solid var(--color-warm)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="accessibility_mode"
              value="large"
              defaultChecked={accMode === 'large'}
            />
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--color-ink)',
                  fontSize: 18,
                }}
              >
                Larger text
              </div>
              <div
                className="text-xs fg-mono"
                style={{ color: 'var(--color-muted)' }}
              >
                Bigger fonts and bigger checkboxes throughout
              </div>
            </div>
          </label>
        </div>
        <div className="pt-2">
          <button type="submit" className="fg-btn-primary">
            Save display
          </button>
        </div>
      </form>

      <div className="mt-6">
        <InstallSection />
      </div>

      <div className="mt-6">
        <PushNotificationsSection />
      </div>
    </div>
  )
}

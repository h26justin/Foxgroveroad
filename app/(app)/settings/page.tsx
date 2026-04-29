import { requireProfile } from '@/lib/auth'
import { updateProfile } from './actions'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const [profile, sp] = await Promise.all([requireProfile(), searchParams])
  const { saved, error } = sp

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
          Update your profile.
        </p>
      </div>

      {saved && <div className="fg-msg-success mb-6">Saved.</div>}
      {error && <div className="fg-msg-error mb-6">{error}</div>}

      <form action={updateProfile} className="fg-card p-6 space-y-5">
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
            Save changes
          </button>
        </div>
      </form>
    </div>
  )
}

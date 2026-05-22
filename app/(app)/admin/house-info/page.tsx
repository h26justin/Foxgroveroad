import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  HOUSE_SETTING_KEYS,
  HOUSE_SETTING_LABELS,
  asSettingsMap,
  type HouseSettingKey,
} from '@/lib/house-settings'
import { updateHouseSettings } from './actions'

export const revalidate = 30

const MULTILINE_KEYS: HouseSettingKey[] = ['fridge_notes', 'arrival_notes']

const HINTS: Partial<Record<HouseSettingKey, string>> = {
  wifi_password: 'Shown to guests in the arrival packet — keep it shareable.',
  fridge_notes:
    'What\'s in the fridge / kitchen for them? Coffee, milk, ground rules, etc.',
  arrival_notes:
    'Anything else they should know on arrival — boiler quirks, parking, alarm code.',
}

export default async function HouseInfoPage({
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

  const { data: rows } = await supabase
    .from('house_settings')
    .select('key, value')

  const settings = asSettingsMap((rows as any[]) ?? [])

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
          House info
        </h1>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          Shown on the guest arrival packet (each approved booking gets a
          shareable URL with this info). Update once, applies to every
          future booking.
        </p>
      </div>

      {saved && <div className="fg-msg-success mb-6">Saved.</div>}
      {error && <div className="fg-msg-error mb-6">{error}</div>}

      <form action={updateHouseSettings} className="fg-card p-6 space-y-5">
        {HOUSE_SETTING_KEYS.map((key) => {
          const isMulti = MULTILINE_KEYS.includes(key)
          return (
            <div key={key}>
              <label htmlFor={key} className="fg-label">
                {HOUSE_SETTING_LABELS[key]}
              </label>
              {isMulti ? (
                <textarea
                  id={key}
                  name={key}
                  rows={4}
                  maxLength={2000}
                  defaultValue={settings[key]}
                  className="fg-input"
                />
              ) : (
                <input
                  id={key}
                  name={key}
                  type="text"
                  maxLength={500}
                  defaultValue={settings[key]}
                  className="fg-input"
                />
              )}
              {HINTS[key] && (
                <p
                  className="text-xs fg-mono mt-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {HINTS[key]}
                </p>
              )}
            </div>
          )
        })}

        <div className="pt-2">
          <button type="submit" className="fg-btn-primary">
            Save house info
          </button>
        </div>
      </form>
    </div>
  )
}

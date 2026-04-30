import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  addTemplate,
  removeTemplate,
} from './actions'

export default async function PrearrivalTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const [, sp, supabase] = await Promise.all([
    requireAdmin(),
    searchParams,
    createClient(),
  ])

  const [roomsRes, templatesRes] = await Promise.all([
    supabase
      .from('rooms')
      .select('id, name, floor, room_type')
      .eq('room_type', 'bedroom')
      .order('floor', { ascending: false })
      .order('name'),
    supabase
      .from('prearrival_templates')
      .select('id, room_id, name, position')
      .order('room_id')
      .order('position')
      .order('name'),
  ])
  const rooms = roomsRes.data
  const templates = templatesRes.data

  const templatesByRoom = new Map<string, any[]>()
  for (const t of templates ?? []) {
    if (!templatesByRoom.has(t.room_id)) templatesByRoom.set(t.room_id, [])
    templatesByRoom.get(t.room_id)!.push(t)
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/house"
          className="text-xs fg-mono inline-flex items-center gap-1 mb-3"
          style={{ color: 'var(--color-muted)' }}
        >
          ← House
        </Link>
        <h1
          className="text-2xl md:text-3xl mb-2"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          Pre-arrival templates
        </h1>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          Per-room checklist of things to verify before a guest arrives.
          Cleaners tick these off in the bedroom organiser.
        </p>
      </div>

      {sp.saved && <div className="fg-msg-success mb-4">Saved.</div>}
      {sp.error && <div className="fg-msg-error mb-4">{sp.error}</div>}

      <div className="space-y-5">
        {(rooms ?? []).map((room) => {
          const roomTemplates = templatesByRoom.get(room.id) ?? []
          return (
            <section key={room.id} className="fg-card p-5">
              <h2
                className="text-lg mb-3"
                style={{
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--color-ink)',
                }}
              >
                🛏 {room.name}
              </h2>

              {roomTemplates.length === 0 ? (
                <p
                  className="text-xs fg-mono mb-3"
                  style={{ color: 'var(--color-muted)' }}
                >
                  No checklist items yet.
                </p>
              ) : (
                <ul className="space-y-1 mb-3">
                  {roomTemplates.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 py-2 border-b"
                      style={{ borderColor: 'var(--color-warm)' }}
                    >
                      <span className="text-sm fg-mono">{t.name}</span>
                      <form action={removeTemplate}>
                        <input
                          type="hidden"
                          name="template_id"
                          value={t.id}
                        />
                        <button
                          type="submit"
                          className="text-xs fg-mono"
                          style={{ color: 'var(--color-red)' }}
                        >
                          Remove
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              <form action={addTemplate} className="flex items-center gap-2">
                <input type="hidden" name="room_id" value={room.id} />
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Pillows arranged, blinds set, lamp on"
                  className="fg-input"
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  className="fg-btn-gold text-xs"
                  style={{ width: 'auto', padding: '10px 16px' }}
                >
                  Add
                </button>
              </form>
            </section>
          )
        })}
      </div>

      {(rooms ?? []).length === 0 && (
        <div className="fg-card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No bedrooms yet.
          </p>
        </div>
      )}
    </div>
  )
}

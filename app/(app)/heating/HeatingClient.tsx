'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  queueAway,
  queueCancelHold,
  queueHold,
  updateZoneSettings,
} from './actions'

export type Zone = {
  id: string
  name: string
  room_id: string | null
  is_hidden: boolean
  current_temp: number | null
  set_temp: number | null
  heat_on: boolean
  offline: boolean
  low_battery: boolean
  hold_on: boolean
  hold_temp: number | null
  standby: boolean
}

export type Reading = {
  zone_id: string
  t: number
  cur: number | null
  set: number | null
}

export type Alert = {
  id: string
  kind: string
  zone_id: string | null
  message: string
  opened_at: string
  resolved_at: string | null
}

export type Command = {
  id: string
  kind: string
  zone_id: string | null
  temp: number | null
  minutes: number | null
  status: string
  error: string | null
  created_at: string
}

type Hub = {
  last_seen_at: string | null
  away: boolean
  holiday: boolean
  bridge_version: string | null
}

const HUB_STALE_MS = 20 * 60 * 1000

const HOLD_TEMPS = [5, 10, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]
const HOLD_DURATIONS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 240, label: '4 hours' },
  { minutes: 480, label: '8 hours' },
  { minutes: 720, label: '12 hours' },
]

const STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting for the bridge',
  sent: 'Sent to the hub',
  done: 'Done',
  failed: 'Failed',
  expired: 'Expired (bridge offline)',
}

export default function HeatingClient({
  isAdmin,
  hub,
  zones,
  readings,
  alerts,
  commands,
  report,
  rooms,
}: {
  isAdmin: boolean
  hub: Hub | null
  zones: Zone[]
  readings: Reading[]
  alerts: Alert[]
  commands: Command[]
  report: { period_start: string; period_end: string; body: string } | null
  rooms: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // While a command is in flight, refresh every 5s so its status (and
  // the zone it changed) updates without a manual reload.
  const inFlight = commands.some(
    (c) => c.status === 'pending' || c.status === 'sent',
  )
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(tick)
  }, [])
  useEffect(() => {
    if (!inFlight) return
    const poll = setInterval(() => router.refresh(), 5_000)
    return () => clearInterval(poll)
  }, [inFlight, router])

  const readingsByZone = useMemo(() => {
    const m = new Map<string, Reading[]>()
    for (const r of readings) {
      const list = m.get(r.zone_id) ?? []
      list.push(r)
      m.set(r.zone_id, list)
    }
    return m
  }, [readings])

  const zoneName = useMemo(
    () => new Map(zones.map((z) => [z.id, z.name])),
    [zones],
  )

  const lastSeen = hub?.last_seen_at ? new Date(hub.last_seen_at).getTime() : null
  const hubOnline = lastSeen !== null && now - lastSeen < HUB_STALE_MS
  const openAlerts = alerts.filter((a) => !a.resolved_at)

  function run(fn: () => Promise<{ ok?: true; error?: string }>) {
    setBusy(true)
    setError(null)
    startTransition(async () => {
      const r = await fn()
      setBusy(false)
      if (r.error) {
        setError(r.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1
            className="text-3xl mb-1"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
          >
            Heating
          </h1>
          <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
            {lastSeen === null ? (
              'Waiting for the first check-in from the bridge.'
            ) : (
              <span suppressHydrationWarning>
                {hubOnline ? 'Live' : 'Not reporting'} · last update{' '}
                {timeAgo(now - lastSeen)}
              </span>
            )}
            {hub?.away && ' · Away (frost protection) on'}
            {hub?.holiday && ' · Holiday mode on'}
          </p>
        </div>
        {isAdmin && hub && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => queueAway(!hub.away))}
            className={hub.away ? 'fg-btn-gold text-xs' : 'fg-btn-ghost text-xs'}
            style={{ width: 'auto', padding: '8px 14px' }}
            title="Away puts every thermostat into frost protection"
          >
            {hub.away ? 'Turn away mode off' : 'Away mode (frost protection)'}
          </button>
        )}
      </div>

      {error && <div className="fg-msg-error mb-4">{error}</div>}

      {openAlerts.length > 0 && (
        <div className="space-y-2 mb-6">
          {openAlerts.map((a) => (
            <div key={a.id} className="fg-msg-error">
              {a.message}
            </div>
          ))}
        </div>
      )}

      {zones.length === 0 ? (
        <div className="fg-card p-8 text-center" style={{ color: 'var(--color-muted)' }}>
          No thermostats yet. They appear here once the bridge in the house
          checks in.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {zones.map((z) => (
            <ZoneCard
              key={z.id}
              zone={z}
              history={readingsByZone.get(z.id) ?? []}
              isAdmin={isAdmin}
              busy={busy}
              rooms={rooms}
              onHold={(t, m) => run(() => queueHold(z.id, t, m))}
              onCancelHold={() => run(() => queueCancelHold(z.id))}
              onSettings={(roomId, hidden) =>
                run(() => updateZoneSettings(z.id, roomId, hidden))
              }
            />
          ))}
        </div>
      )}

      {report && (
        <section className="mb-8">
          <div className="fg-section-label mb-2">
            Weekly report · {report.period_start} to {report.period_end}
          </div>
          <div
            className="fg-card p-5 text-sm"
            style={{ whiteSpace: 'pre-wrap', color: 'var(--color-ink)' }}
          >
            {report.body}
          </div>
        </section>
      )}

      {commands.length > 0 && (
        <section className="mb-8">
          <div className="fg-section-label mb-2">Recent changes</div>
          <div className="fg-card divide-y">
            {commands.map((c) => (
              <div
                key={c.id}
                className="px-4 py-2 text-sm flex justify-between gap-3 flex-wrap"
              >
                <span>{describeCommand(c, zoneName)}</span>
                <span
                  className="fg-mono text-xs"
                  style={{
                    color:
                      c.status === 'failed' || c.status === 'expired'
                        ? 'var(--color-red, #b91c1c)'
                        : 'var(--color-muted)',
                  }}
                  title={c.error ?? undefined}
                >
                  {STATUS_LABEL[c.status] ?? c.status}
                  {c.error ? ` — ${c.error}` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {alerts.some((a) => a.resolved_at) && (
        <section>
          <div className="fg-section-label mb-2">Earlier alerts</div>
          <div className="fg-card divide-y">
            {alerts
              .filter((a) => a.resolved_at)
              .map((a) => (
                <div key={a.id} className="px-4 py-2 text-sm">
                  <span className="fg-mono text-xs" style={{ color: 'var(--color-muted)' }}>
                    {new Date(a.opened_at).toLocaleString('en-GB', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>{' '}
                  {a.message}
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ZoneCard({
  zone,
  history,
  isAdmin,
  busy,
  rooms,
  onHold,
  onCancelHold,
  onSettings,
}: {
  zone: Zone
  history: Reading[]
  isAdmin: boolean
  busy: boolean
  rooms: { id: string; name: string }[]
  onHold: (temp: number, minutes: number) => void
  onCancelHold: () => void
  onSettings: (roomId: string | null, hidden: boolean) => void
}) {
  const [holdOpen, setHoldOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [holdTemp, setHoldTemp] = useState(
    Math.min(25, Math.max(5, Math.round(zone.set_temp ?? 20))),
  )
  const [holdMinutes, setHoldMinutes] = useState(120)

  return (
    <div className="fg-card p-4" style={{ opacity: zone.is_hidden ? 0.6 : 1 }}>
      <div className="flex justify-between items-start gap-2">
        <div>
          <div className="font-medium" style={{ color: 'var(--color-ink)' }}>
            {zone.name}
          </div>
          <div className="flex gap-1 flex-wrap mt-1">
            {zone.heat_on && <span className="fg-pill fg-pill-amber">Heating</span>}
            {zone.hold_on && (
              <span className="fg-pill fg-pill-blue">
                Hold{zone.hold_temp !== null ? ` ${zone.hold_temp}°` : ''}
              </span>
            )}
            {zone.standby && <span className="fg-pill fg-pill-muted">Standby</span>}
            {zone.offline && <span className="fg-pill fg-pill-red">Offline</span>}
            {zone.low_battery && <span className="fg-pill fg-pill-red">Battery low</span>}
            {zone.is_hidden && <span className="fg-pill fg-pill-ghost">Hidden</span>}
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-3xl"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
          >
            {zone.current_temp !== null ? `${zone.current_temp.toFixed(1)}°` : '—'}
          </div>
          <div className="text-xs fg-mono" style={{ color: 'var(--color-muted)' }}>
            set {zone.set_temp !== null ? `${zone.set_temp.toFixed(1)}°` : '—'}
          </div>
        </div>
      </div>

      <Sparkline history={history} />

      {isAdmin && (
        <div className="flex gap-2 flex-wrap mt-2">
          <button
            type="button"
            className="fg-btn-ghost text-xs"
            style={{ width: 'auto', padding: '6px 10px' }}
            disabled={busy || zone.offline}
            onClick={() => setHoldOpen((v) => !v)}
          >
            Set temperature…
          </button>
          {zone.hold_on && (
            <button
              type="button"
              className="fg-btn-ghost text-xs"
              style={{ width: 'auto', padding: '6px 10px' }}
              disabled={busy}
              onClick={onCancelHold}
            >
              Back to schedule
            </button>
          )}
          <button
            type="button"
            className="fg-btn-ghost text-xs"
            style={{ width: 'auto', padding: '6px 10px', marginLeft: 'auto' }}
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label={`Settings for ${zone.name}`}
          >
            ⚙
          </button>
        </div>
      )}

      {isAdmin && holdOpen && (
        <div className="mt-3 flex gap-2 flex-wrap items-center">
          <select
            className="fg-input"
            style={{ width: 'auto' }}
            value={holdTemp}
            onChange={(e) => setHoldTemp(Number(e.target.value))}
            aria-label="Temperature"
          >
            {HOLD_TEMPS.map((t) => (
              <option key={t} value={t}>
                {t}°C
              </option>
            ))}
          </select>
          <select
            className="fg-input"
            style={{ width: 'auto' }}
            value={holdMinutes}
            onChange={(e) => setHoldMinutes(Number(e.target.value))}
            aria-label="For how long"
          >
            {HOLD_DURATIONS.map((d) => (
              <option key={d.minutes} value={d.minutes}>
                for {d.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="fg-btn-gold text-xs"
            style={{ width: 'auto', padding: '8px 12px' }}
            disabled={busy}
            onClick={() => {
              onHold(holdTemp, holdMinutes)
              setHoldOpen(false)
            }}
          >
            Apply
          </button>
        </div>
      )}

      {isAdmin && settingsOpen && (
        <div className="mt-3 flex gap-2 flex-wrap items-center text-sm">
          <label className="fg-label" htmlFor={`room-${zone.id}`}>
            Room
          </label>
          <select
            id={`room-${zone.id}`}
            className="fg-input"
            style={{ width: 'auto' }}
            defaultValue={zone.room_id ?? ''}
            disabled={busy}
            onChange={(e) => onSettings(e.target.value || null, zone.is_hidden)}
          >
            <option value="">Not linked</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="fg-btn-ghost text-xs"
            style={{ width: 'auto', padding: '6px 10px' }}
            disabled={busy}
            onClick={() => onSettings(zone.room_id, !zone.is_hidden)}
          >
            {zone.is_hidden ? 'Show to family' : 'Hide'}
          </button>
        </div>
      )}
    </div>
  )
}

/** 24h of readings: solid line = room temperature, dashed = set point. */
function Sparkline({ history }: { history: Reading[] }) {
  const points = history.filter((r) => r.cur !== null)
  if (points.length < 2) {
    return (
      <div className="text-xs fg-mono mt-3" style={{ color: 'var(--color-muted)' }}>
        History builds up over the next few hours.
      </div>
    )
  }

  const W = 300
  const H = 48
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const values = points.flatMap((p) => [p.cur!, ...(p.set !== null ? [p.set] : [])])
  const lo = Math.floor(Math.min(...values) - 0.5)
  const hi = Math.ceil(Math.max(...values) + 0.5)
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W
  const y = (v: number) => H - ((v - lo) / Math.max(1, hi - lo)) * H
  const path = (key: 'cur' | 'set') =>
    points
      .filter((p) => p[key] !== null)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p[key]!).toFixed(1)}`)
      .join(' ')

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: H }}
        role="img"
        aria-label={`Last 24 hours: ${lo}° to ${hi}°`}
      >
        <path
          d={path('set')}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path('cur')}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        className="flex justify-between text-xs fg-mono"
        style={{ color: 'var(--color-muted)' }}
      >
        <span>24h</span>
        <span>
          {lo}°–{hi}°
        </span>
      </div>
    </div>
  )
}

function describeCommand(c: Command, zoneName: Map<string, string>): string {
  const zone = c.zone_id ? zoneName.get(c.zone_id) ?? 'A zone' : ''
  switch (c.kind) {
    case 'hold':
      return `${zone}: ${c.temp}°C for ${formatMinutes(c.minutes ?? 0)}`
    case 'cancel_hold':
      return `${zone}: back to schedule`
    case 'away_on':
      return 'Away mode on'
    case 'away_off':
      return 'Away mode off'
    default:
      return c.kind
  }
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`
  const h = m / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hour${h === 1 ? '' : 's'}`
}

function timeAgo(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

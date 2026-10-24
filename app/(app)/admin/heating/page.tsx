import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/feature-flags'
import {
  getHeatingOverview,
  RELAY_STALE_MINUTES,
  type HeatingCommand,
  type HeatingReading,
  type HeatingZone,
} from '@/lib/heating'
import { queueHeatingCommand } from './actions'
import AutoRefresh from './AutoRefresh'

const HOLD_HOURS = [1, 2, 3, 6, 12]

export default async function HeatingPage({
  searchParams,
}: {
  searchParams: Promise<{ queued?: string; error?: string }>
}) {
  const [, sp, enabled, overview] = await Promise.all([
    requireAdmin(),
    searchParams,
    isFeatureEnabled('heating'),
    getHeatingOverview(),
  ])
  if (!enabled) redirect('/housekeeping')

  const { hub, lastSeenAgeMs, zones, readings, commands } = overview
  const stale =
    lastSeenAgeMs === null || lastSeenAgeMs > RELAY_STALE_MINUTES * 60_000
  const inFlight = commands.some((c) => c.status === 'pending' || c.status === 'sent')

  const readingsByZone = new Map<string, HeatingReading[]>()
  for (const r of readings) {
    if (!readingsByZone.has(r.zone_name)) readingsByZone.set(r.zone_name, [])
    readingsByZone.get(r.zone_name)!.push(r)
  }

  return (
    <div className="max-w-4xl">
      <AutoRefresh />
      <div className="mb-8">
        <h1
          className="text-3xl mb-2"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
        >
          Heating
        </h1>
        <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          {lastSeenAgeMs === null
            ? 'Waiting for the relay to report in for the first time.'
            : `Hub last reported ${timeAgo(lastSeenAgeMs)}.`}
          {inFlight && ' Changes are queued — the relay picks them up within a minute.'}
        </p>
      </div>

      {sp.queued && <div className="fg-msg-success mb-6">Queued for the hub.</div>}
      {sp.error && <div className="fg-msg-error mb-6">{sp.error}</div>}
      {lastSeenAgeMs !== null && stale && (
        <div className="fg-msg-error mb-6">
          The relay hasn&apos;t reported for over {RELAY_STALE_MINUTES} minutes —
          check the device at the house is on and online. Readings below may be out of date.
        </div>
      )}
      {hub.error && <div className="fg-msg-error mb-6">Relay error: {hub.error}</div>}

      {lastSeenAgeMs === null ? (
        <SetupCard />
      ) : (
        <>
          <div className="fg-card p-5 mb-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div
                className="text-base"
                style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
              >
                Away mode {hub.hub_away ? 'is on' : 'is off'}
              </div>
              <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
                Puts every thermostat into frost protection.
                {hub.hub_holiday && ' Holiday mode is also set on the hub.'}
              </p>
            </div>
            <form action={queueHeatingCommand}>
              <input type="hidden" name="kind" value={hub.hub_away ? 'away_off' : 'away_on'} />
              <button
                type="submit"
                className={hub.hub_away ? 'fg-btn-gold' : 'fg-btn-ghost'}
                style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}
              >
                {hub.hub_away ? 'Turn away off' : 'Turn away on'}
              </button>
            </form>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {zones.map((z) => (
              <ZoneCard key={z.zone_name} zone={z} readings={readingsByZone.get(z.zone_name) ?? []} />
            ))}
          </div>
          {zones.length === 0 && (
            <p className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
              The hub reported no thermostats.
            </p>
          )}

          {commands.length > 0 && <RecentCommands commands={commands} />}
        </>
      )}
    </div>
  )
}

function ZoneCard({ zone: z, readings }: { zone: HeatingZone; readings: HeatingReading[] }) {
  return (
    <div className="fg-card p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div
          className="text-base"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
        >
          {z.zone_name}
        </div>
        {z.heat_on && (
          <span className="fg-pill fg-pill-amber text-xs" title="Calling for heat">
            heating
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-3xl" style={{ color: 'var(--color-ink)' }}>
          {fmtTemp(z.actual_temp)}
        </span>
        <span className="text-sm fg-mono" style={{ color: 'var(--color-muted)' }}>
          set {fmtTemp(z.hold_on && z.hold_temp !== null ? z.hold_temp : z.set_temp)}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {z.hold_on && (
          <span className="fg-pill fg-pill-blue text-xs">hold {z.hold_time ?? ''}</span>
        )}
        {z.frost_on && <span className="fg-pill fg-pill-muted text-xs">frost</span>}
        {z.window_open && <span className="fg-pill fg-pill-amber text-xs">window open</span>}
        {z.low_battery && <span className="fg-pill fg-pill-red text-xs">low battery</span>}
        {z.offline && <span className="fg-pill fg-pill-red text-xs">offline</span>}
      </div>

      <Sparkline readings={readings} />

      <details className="mt-3">
        <summary
          className="text-sm fg-mono cursor-pointer"
          style={{ color: 'var(--color-muted)' }}
        >
          Change
        </summary>
        <div className="mt-3 space-y-3">
          <form action={queueHeatingCommand} className="flex items-center gap-2">
            <input type="hidden" name="kind" value="set_temp" />
            <input type="hidden" name="zone_name" value={z.zone_name} />
            <TempInput defaultValue={z.set_temp} />
            <button type="submit" className="fg-btn-ghost" style={btnStyle}>
              Set target
            </button>
          </form>

          <form action={queueHeatingCommand} className="flex items-center gap-2 flex-wrap">
            <input type="hidden" name="kind" value="hold" />
            <input type="hidden" name="zone_name" value={z.zone_name} />
            <TempInput defaultValue={z.set_temp} />
            <select name="hours" defaultValue="2" className="fg-input" style={{ width: 90 }}>
              {HOLD_HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}h
                </option>
              ))}
            </select>
            <button type="submit" className="fg-btn-ghost" style={btnStyle}>
              Hold
            </button>
          </form>

          <div className="flex gap-2 flex-wrap">
            {z.hold_on && (
              <form action={queueHeatingCommand}>
                <input type="hidden" name="kind" value="cancel_hold" />
                <input type="hidden" name="zone_name" value={z.zone_name} />
                <button type="submit" className="fg-btn-ghost" style={btnStyle}>
                  Cancel hold
                </button>
              </form>
            )}
            <form action={queueHeatingCommand}>
              <input type="hidden" name="kind" value={z.frost_on ? 'frost_off' : 'frost_on'} />
              <input type="hidden" name="zone_name" value={z.zone_name} />
              <button type="submit" className="fg-btn-ghost" style={btnStyle}>
                {z.frost_on ? 'Frost off' : 'Frost on'}
              </button>
            </form>
          </div>
        </div>
      </details>
    </div>
  )
}

const btnStyle = { width: 'auto', padding: '8px 14px', fontSize: 13 } as const

function TempInput({ defaultValue }: { defaultValue: number | null }) {
  return (
    <input
      name="temp"
      type="number"
      min={5}
      max={30}
      step={1}
      required
      defaultValue={defaultValue === null ? 20 : Math.round(defaultValue)}
      className="fg-input"
      style={{ width: 80 }}
      aria-label="Temperature °C"
    />
  )
}

/**
 * Last 24h of actual temperature (solid) against target (dashed).
 * Plain SVG — no chart library for one line.
 */
function Sparkline({ readings }: { readings: HeatingReading[] }) {
  const points = readings.filter((r) => r.actual_temp !== null)
  if (points.length < 2) {
    return (
      <p className="text-xs fg-mono" style={{ color: 'var(--color-faint)' }}>
        Chart appears once there&apos;s a few readings.
      </p>
    )
  }
  const W = 240
  const H = 48
  const t0 = new Date(points[0].recorded_at).getTime()
  const t1 = new Date(points[points.length - 1].recorded_at).getTime()
  const temps = points.flatMap((p) => [p.actual_temp!, p.set_temp ?? p.actual_temp!])
  const lo = Math.floor(Math.min(...temps)) - 1
  const hi = Math.ceil(Math.max(...temps)) + 1
  const x = (iso: string) => ((new Date(iso).getTime() - t0) / Math.max(1, t1 - t0)) * W
  const y = (t: number) => H - ((t - lo) / (hi - lo)) * H
  const line = (vals: (HeatingReading & { v: number })[]) =>
    vals.map((p, i) => `${i ? 'L' : 'M'}${x(p.recorded_at).toFixed(1)},${y(p.v).toFixed(1)}`).join('')

  const actual = line(points.map((p) => ({ ...p, v: p.actual_temp! })))
  const target = line(
    points.filter((p) => p.set_temp !== null).map((p) => ({ ...p, v: p.set_temp! })),
  )

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label="Temperature over the last 24 hours"
      >
        {target && (
          <path
            d={target}
            fill="none"
            stroke="var(--color-faint)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={actual}
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between text-xs fg-mono" style={{ color: 'var(--color-faint)' }}>
        <span>{lo + 1}–{hi - 1}°C · 24h</span>
        <span>— actual · - - target</span>
      </div>
    </div>
  )
}

const COMMAND_LABELS: Record<HeatingCommand['kind'], string> = {
  set_temp: 'Set target',
  hold: 'Hold',
  cancel_hold: 'Cancel hold',
  frost_on: 'Frost on',
  frost_off: 'Frost off',
  away_on: 'Away on',
  away_off: 'Away off',
}

function RecentCommands({ commands }: { commands: HeatingCommand[] }) {
  return (
    <div className="mt-8">
      <div className="fg-section-label mb-3">Recent changes</div>
      <div className="fg-card divide-y" style={{ borderColor: 'var(--color-warm)' }}>
        {commands.map((c) => (
          <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <span style={{ color: 'var(--color-ink)' }}>
                {COMMAND_LABELS[c.kind]}
                {c.zone_name && ` · ${c.zone_name}`}
                {c.temp !== null && ` · ${Number(c.temp)}°C`}
                {c.minutes !== null && ` · ${c.minutes / 60}h`}
              </span>
              <div className="text-xs fg-mono" style={{ color: 'var(--color-muted)' }}>
                {fmtWhen(c.created_at)}
                {c.status === 'failed' && c.result && ` — ${c.result}`}
              </div>
            </div>
            <span className={`fg-pill text-xs ${STATUS_PILL[c.status]}`}>{c.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const STATUS_PILL: Record<HeatingCommand['status'], string> = {
  pending: 'fg-pill-muted',
  sent: 'fg-pill-blue',
  done: 'fg-pill-green',
  failed: 'fg-pill-red',
}

function SetupCard() {
  return (
    <div className="fg-card p-5 text-sm" style={{ color: 'var(--color-ink)' }}>
      <div className="text-base mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
        Connect the Heatmiser hub
      </div>
      <p className="fg-mono mb-2" style={{ color: 'var(--color-muted)' }}>
        The neoHub only talks to devices on the house WiFi, so a small relay
        has to run on something always-on at the house (e.g. a Raspberry Pi).
      </p>
      <ol className="list-decimal pl-5 space-y-1 fg-mono" style={{ color: 'var(--color-muted)' }}>
        <li>In the Heatmiser Neo app: Settings → System → API Access → + to create a token.</li>
        <li>Set <code>HEATING_RELAY_SECRET</code> in Vercel (any random 32+ character string) and redeploy.</li>
        <li>Run <code>heating-relay/</code> from the repo on the device — see its README.</li>
      </ol>
    </div>
  )
}

function fmtTemp(t: number | null): string {
  return t === null ? '—' : `${t.toFixed(1)}°`
}

function timeAgo(ageMs: number): string {
  const mins = Math.round(ageMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)} days ago`
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

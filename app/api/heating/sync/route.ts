import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notify'
import { parseLiveData, type HeatingZone } from '@/lib/heating'
import { fetchOutdoorWeather } from '@/lib/weather'
import { addDaysISO, todayISO } from '@/lib/dates'

/**
 * Endpoint for heating-relay/ (the script running at the house).
 *
 * URL: POST /api/heating/sync
 * Auth: `Authorization: Bearer <HEATING_RELAY_SECRET>`
 *
 * Body:
 *   {
 *     live?:    <neoHub GET_LIVE_DATA response> — sent every few minutes
 *               and straight after running commands
 *     error?:   string — relay couldn't reach the hub
 *     results?: [{ id, ok, result }] — outcomes of commands it ran
 *   }
 *
 * Response: { commands: [...] } — pending commands for the relay to
 * run. They're marked 'sent' here; the relay reports back via
 * `results` on its next call.
 *
 * Uses the service-role client: the relay has no user session, so the
 * shared secret IS the auth. Keep the secret out of git.
 */

type ResultIn = { id?: unknown; ok?: unknown; result?: unknown }

const UUID_RE = /^[0-9a-f-]{36}$/i

/** Commands still 'sent' after this long are marked failed. */
const SENT_TIMEOUT_MINUTES = 10

/** Drop readings older than this so the table doesn't grow forever.
 *  heating_daily keeps the per-day summary indefinitely. */
const READING_RETENTION_DAYS = 180

/** Refresh outdoor temperature at most this often. */
const WEATHER_TTL_MINUTES = 15

/** Recompute heating_daily (today + yesterday) at most this often. */
const ROLLUP_TTL_MINUTES = 60

function authorised(request: Request): boolean {
  const secret = process.env.HEATING_RELAY_SECRET
  if (!secret || secret.length < 32) return false
  const header = request.headers.get('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7) : ''
  // Compare digests so the comparison is constant-time regardless of
  // the supplied token's length.
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(secret).digest()
  return timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return new Response('Unauthorised', { status: 401 })
  }

  let body: { live?: unknown; error?: unknown; results?: unknown }
  try {
    body = await request.json()
  } catch {
    return new Response('Bad JSON', { status: 400 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // 1. Record command outcomes the relay is reporting.
  const results = Array.isArray(body.results) ? (body.results as ResultIn[]) : []
  for (const r of results.slice(0, 50)) {
    if (typeof r.id !== 'string' || !UUID_RE.test(r.id)) continue
    await admin
      .from('heating_commands')
      .update({
        status: r.ok === true ? 'done' : 'failed',
        result: String(r.result ?? '').slice(0, 500),
        completed_at: now,
      })
      .eq('id', r.id)
      .eq('status', 'sent')
  }

  // Anything the relay picked up but never reported on (relay crashed
  // mid-run) shouldn't sit in 'sent' forever.
  await admin
    .from('heating_commands')
    .update({ status: 'failed', result: 'No response from relay', completed_at: now })
    .eq('status', 'sent')
    .lt('sent_at', new Date(Date.now() - SENT_TIMEOUT_MINUTES * 60_000).toISOString())

  // 2. Hub status + zone snapshot + readings.
  const relayError =
    typeof body.error === 'string' && body.error ? body.error.slice(0, 500) : null

  if (body.live) {
    const { hubAway, hubHoliday, zones } = parseLiveData(body.live)

    const [{ data: previous }, { data: hubRow }] = await Promise.all([
      admin.from('heating_zones').select('zone_name, actual_temp, offline, low_battery'),
      admin
        .from('heating_hub_status')
        .select('outdoor_temp, outdoor_fetched_at, rollup_at')
        .eq('id', 'singleton')
        .maybeSingle(),
    ])
    const hubState = (hubRow ?? {}) as {
      outdoor_temp?: number | string | null
      outdoor_fetched_at?: string | null
      rollup_at?: string | null
    }

    // Outdoor temperature — the thermal model needs it on every reading.
    let outdoorTemp =
      hubState.outdoor_temp == null ? null : Number(hubState.outdoor_temp)
    const weatherUpdate: Record<string, unknown> = {}
    if (olderThan(hubState.outdoor_fetched_at, WEATHER_TTL_MINUTES)) {
      const weather = await fetchHouseWeather(admin)
      if (weather) {
        outdoorTemp = Math.round(weather.current * 10) / 10
        weatherUpdate.outdoor_temp = outdoorTemp
        weatherUpdate.forecast = weather.forecast
        weatherUpdate.outdoor_fetched_at = now
      } else if (olderThan(hubState.outdoor_fetched_at, 3 * WEATHER_TTL_MINUTES)) {
        // Don't stamp stale weather onto readings — it would skew the model.
        outdoorTemp = null
      }
    }

    await admin
      .from('heating_hub_status')
      .update({
        last_seen_at: now,
        hub_away: hubAway,
        hub_holiday: hubHoliday,
        error: relayError,
        updated_at: now,
        ...weatherUpdate,
      })
      .eq('id', 'singleton')

    if (zones.length > 0) {
      await admin
        .from('heating_zones')
        .upsert(
          zones.map((z) => ({ ...z, updated_at: now })),
          { onConflict: 'zone_name' },
        )
      await admin.from('heating_readings').insert(
        zones.map((z) => ({
          zone_name: z.zone_name,
          recorded_at: now,
          actual_temp: z.actual_temp,
          set_temp: z.set_temp,
          heat_on: z.heat_on,
          outdoor_temp: outdoorTemp,
        })),
      )
      // Zones renamed or removed on the hub.
      const names = zones.map((z) => `"${z.zone_name.replace(/"/g, '""')}"`)
      await admin
        .from('heating_zones')
        .delete()
        .not('zone_name', 'in', `(${names.join(',')})`)
    }

    await admin
      .from('heating_readings')
      .delete()
      .lt(
        'recorded_at',
        new Date(Date.now() - READING_RETENTION_DAYS * 86_400_000).toISOString(),
      )

    if (olderThan(hubState.rollup_at, ROLLUP_TTL_MINUTES)) {
      const { error: rollupErr } = await admin.rpc('heating_rollup', {
        p_since: addDaysISO(todayISO(), -1),
      })
      if (rollupErr) console.warn('[heating] rollup failed:', rollupErr.message)
      else {
        await admin
          .from('heating_hub_status')
          .update({ rollup_at: now })
          .eq('id', 'singleton')
      }
    }

    await sendAlerts(
      admin,
      (previous as Pick<HeatingZone, 'zone_name' | 'actual_temp' | 'offline' | 'low_battery'>[] | null) ?? [],
      zones,
    )
  } else if (relayError) {
    // Relay is up but couldn't reach the hub. last_seen_at stays put so
    // the page shows the data going stale; the error clears on the next
    // successful reading. (No live + no error = just polling commands.)
    await admin
      .from('heating_hub_status')
      .update({ error: relayError, updated_at: now })
      .eq('id', 'singleton')
  }

  // 3. Hand over pending commands.
  const { data: pending } = await admin
    .from('heating_commands')
    .select('id, kind, zone_name, temp, minutes')
    .eq('status', 'pending')
    .order('created_at')
    .limit(10)

  const commands = (pending as { id: string }[] | null) ?? []
  if (commands.length > 0) {
    await admin
      .from('heating_commands')
      .update({ status: 'sent', sent_at: now })
      .in(
        'id',
        commands.map((c) => c.id),
      )
      .eq('status', 'pending')
  }

  return Response.json({ commands })
}

/**
 * Push admins when a zone goes cold, drops offline, or reports a low
 * battery. Only fires on the transition, so a cold room alerts once
 * rather than every poll.
 */
async function sendAlerts(
  admin: ReturnType<typeof createAdminClient>,
  previous: Pick<HeatingZone, 'zone_name' | 'actual_temp' | 'offline' | 'low_battery'>[],
  zones: ReturnType<typeof parseLiveData>['zones'],
) {
  const { data: setting } = await admin
    .from('house_settings')
    .select('value')
    .eq('key', 'heating_cold_alert_c')
    .maybeSingle()
  const rawThreshold = String((setting as { value?: string } | null)?.value ?? '').trim()
  const threshold = rawThreshold === '' ? null : parseFloat(rawThreshold)

  const prevByName = new Map(previous.map((p) => [p.zone_name, p]))
  const lines: string[] = []
  for (const z of zones) {
    const prev = prevByName.get(z.zone_name)
    const prevTemp = prev?.actual_temp == null ? null : Number(prev.actual_temp)
    if (
      threshold !== null &&
      Number.isFinite(threshold) &&
      z.actual_temp !== null &&
      z.actual_temp < threshold &&
      (prevTemp === null || prevTemp >= threshold)
    ) {
      lines.push(`${z.zone_name} is ${z.actual_temp}°C (below ${threshold}°C)`)
    }
    if (z.offline && !prev?.offline) lines.push(`${z.zone_name} thermostat is offline`)
    if (z.low_battery && !prev?.low_battery) lines.push(`${z.zone_name} has a low battery`)
  }
  if (lines.length === 0) return

  const { data: admins } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('is_deleted', false)
  const adminIds = ((admins as { id: string }[] | null) ?? []).map((a) => a.id)

  await notifyUsers(adminIds, {
    title: 'Heating alert',
    body: lines.join('\n'),
    url: '/admin/heating',
    tag: 'heating-alert',
  })
}

function olderThan(iso: string | null | undefined, minutes: number): boolean {
  return !iso || Date.now() - new Date(iso).getTime() > minutes * 60_000
}

/** Location comes from House info (weather_latitude / weather_longitude). */
async function fetchHouseWeather(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin
    .from('house_settings')
    .select('key, value')
    .in('key', ['weather_latitude', 'weather_longitude'])
  const byKey = new Map(
    ((data as { key: string; value: string }[] | null) ?? []).map((r) => [r.key, r.value]),
  )
  const lat = parseFloat(byKey.get('weather_latitude') ?? '')
  const lon = parseFloat(byKey.get('weather_longitude') ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return fetchOutdoorWeather(lat, lon)
}

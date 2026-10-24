import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notify'
import { type CommandKind } from '@/lib/heating-limits'

/**
 * Heating (Heatmiser neoHub) — server side.
 *
 * The neoHub only answers on the home network, so a bridge in the house
 * (bridge/heatmiser/) polls it and POSTs what it sees to
 * /api/heating/bridge. That route calls `ingestBridgeReport`, which:
 *   1. records the hub + zone state (and a reading every ~5 minutes),
 *   2. records the results of commands the bridge ran,
 *   3. works out alerts and notifies admins of new ones,
 *   4. hands back any queued commands for the bridge to run.
 *
 * Everything here uses the service-role client, so callers MUST have
 * authenticated the request first (`bearerMatches`).
 */

// Alert thresholds.
const HUB_OFFLINE_AFTER_MS = 20 * 60 * 1000
const FROST_OPEN_BELOW = 7
const FROST_CLEAR_AT = 8
const NOT_HEATING_WINDOW_MIN = 120
const NOT_HEATING_GAP = 1.5
const EMPTY_ROOM_SETPOINT = 18
const READING_EVERY_MS = 4.5 * 60 * 1000
const COMMAND_TTL_MS = 15 * 60 * 1000

// ─── Auth ──────────────────────────────────────────────────────────────

/**
 * Constant-time check of `Authorization: Bearer <secret>` against the
 * named env var. Returns false when the env var isn't set, so a missing
 * secret can never mean "open".
 */
export function bearerMatches(request: Request, envName: string): boolean {
  const expected = process.env[envName]
  if (!expected || expected.length < 24) return false
  const header = request.headers.get('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7) : ''
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

// ─── Bridge payload ────────────────────────────────────────────────────

export type BridgeZone = {
  name: string
  current_temp: number | null
  set_temp: number | null
  heat_on: boolean
  offline: boolean
  low_battery: boolean
  hold_on: boolean
  hold_temp: number | null
  standby: boolean
}

export type BridgeReport = {
  hub: { away: boolean; holiday: boolean; bridge_version: string | null }
  zones: BridgeZone[]
  results: { id: string; ok: boolean; error: string | null }[]
}

export type BridgeCommand = {
  id: string
  kind: CommandKind
  zone: string | null
  temp: number | null
  minutes: number | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function temp(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < -30 || n > 60) return null
  return Math.round(n * 10) / 10
}

/** Validates the bridge's JSON. Returns null if it isn't usable. */
export function parseBridgeReport(body: unknown): BridgeReport | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, any>

  const hub = {
    away: !!b.hub?.away,
    holiday: !!b.hub?.holiday,
    bridge_version:
      typeof b.hub?.bridge_version === 'string'
        ? b.hub.bridge_version.slice(0, 40)
        : null,
  }

  if (!Array.isArray(b.zones) || b.zones.length > 50) return null
  const zones: BridgeZone[] = []
  const seen = new Set<string>()
  for (const z of b.zones) {
    const name = typeof z?.name === 'string' ? z.name.trim() : ''
    if (!name || name.length > 100 || seen.has(name)) continue
    seen.add(name)
    zones.push({
      name,
      current_temp: temp(z.current_temp),
      set_temp: temp(z.set_temp),
      heat_on: !!z.heat_on,
      offline: !!z.offline,
      low_battery: !!z.low_battery,
      hold_on: !!z.hold_on,
      hold_temp: temp(z.hold_temp),
      standby: !!z.standby,
    })
  }

  const results: BridgeReport['results'] = []
  if (Array.isArray(b.results)) {
    for (const r of b.results.slice(0, 50)) {
      if (typeof r?.id !== 'string' || !UUID_RE.test(r.id)) continue
      results.push({
        id: r.id,
        ok: r.ok === true,
        error: typeof r.error === 'string' ? r.error.slice(0, 500) : null,
      })
    }
  }

  return { hub, zones, results }
}

// ─── Ingest ────────────────────────────────────────────────────────────

export async function ingestBridgeReport(
  report: BridgeReport,
): Promise<BridgeCommand[]> {
  const admin = createAdminClient()
  const now = new Date()
  const nowIso = now.toISOString()

  await admin
    .from('heating_hub')
    .upsert({
      id: 1,
      last_seen_at: nowIso,
      away: report.hub.away,
      holiday: report.hub.holiday,
      bridge_version: report.hub.bridge_version,
      updated_at: nowIso,
    } as any)

  if (report.zones.length > 0) {
    const { data: before } = await admin
      .from('heating_zones')
      .select('name, last_reading_at')
      .in(
        'name',
        report.zones.map((z) => z.name),
      )
    const lastReading = new Map<string, string | null>(
      ((before as any[]) ?? []).map((r) => [r.name, r.last_reading_at]),
    )
    const due = new Set(
      report.zones
        .filter((z) => {
          const last = lastReading.get(z.name)
          return !last || now.getTime() - new Date(last).getTime() >= READING_EVERY_MS
        })
        .map((z) => z.name),
    )

    const { data: upserted, error } = await admin
      .from('heating_zones')
      .upsert(
        report.zones.map((z) => ({
          ...z,
          updated_at: nowIso,
          // Always send the column: a bulk upsert fills missing keys
          // with NULL, which would wipe the previous time.
          last_reading_at: due.has(z.name)
            ? nowIso
            : lastReading.get(z.name) ?? null,
        })) as any,
        { onConflict: 'name' },
      )
      .select('id, name')
    if (error) console.error('[heating] zone upsert failed:', error.message)

    const idByName = new Map<string, string>(
      ((upserted as any[]) ?? []).map((r) => [r.name, r.id]),
    )
    const readings = report.zones
      .filter((z) => due.has(z.name) && idByName.has(z.name))
      .map((z) => ({
        zone_id: idByName.get(z.name),
        recorded_at: nowIso,
        current_temp: z.current_temp,
        set_temp: z.set_temp,
        heat_on: z.heat_on,
      }))
    if (readings.length > 0) {
      const { error: rErr } = await admin
        .from('heating_readings')
        .insert(readings as any)
      if (rErr) console.error('[heating] readings insert failed:', rErr.message)
    }
  }

  for (const r of report.results) {
    await admin
      .from('heating_commands')
      .update({
        status: r.ok ? 'done' : 'failed',
        error: r.ok ? null : r.error ?? 'Failed',
        done_at: nowIso,
      } as any)
      .eq('id', r.id)
      .eq('status', 'sent')
  }

  await runHeatingChecks({ now })
  return takePendingCommands(now)
}

/**
 * Marks queued commands as sent and returns them for the bridge.
 * Commands older than COMMAND_TTL_MS are expired instead: a "boost the
 * lounge" from an hour ago shouldn't fire when the bridge comes back.
 */
async function takePendingCommands(now: Date): Promise<BridgeCommand[]> {
  const admin = createAdminClient()
  const cutoff = new Date(now.getTime() - COMMAND_TTL_MS).toISOString()

  await admin
    .from('heating_commands')
    .update({ status: 'expired', done_at: now.toISOString() } as any)
    .eq('status', 'pending')
    .lt('created_at', cutoff)
  await admin
    .from('heating_commands')
    .update({
      status: 'failed',
      error: 'No reply from the bridge',
      done_at: now.toISOString(),
    } as any)
    .eq('status', 'sent')
    .lt('sent_at', cutoff)

  const { data: pending } = await admin
    .from('heating_commands')
    .select('id, kind, temp, minutes, zone:heating_zones(name)')
    .eq('status', 'pending')
    .order('created_at')
    .limit(10)
  const rows = (pending as any[]) ?? []
  if (rows.length === 0) return []

  const { data: claimed } = await admin
    .from('heating_commands')
    .update({ status: 'sent', sent_at: now.toISOString() } as any)
    .in(
      'id',
      rows.map((r) => r.id),
    )
    .eq('status', 'pending')
    .select('id')
  const claimedIds = new Set(((claimed as any[]) ?? []).map((r) => r.id))

  return rows
    .filter((r) => claimedIds.has(r.id))
    .map((r) => ({
      id: r.id as string,
      kind: r.kind as CommandKind,
      zone: (r.zone?.name as string | undefined) ?? null,
      temp: r.temp === null ? null : Number(r.temp),
      minutes: r.minutes as number | null,
    }))
}

// ─── Alerts ────────────────────────────────────────────────────────────

type AlertKind =
  | 'hub_offline'
  | 'zone_offline'
  | 'frost'
  | 'low_battery'
  | 'not_heating'
  | 'empty_room_heating'

type WantedAlert = { kind: AlertKind; zone_id: string | null; message: string }

const ALERT_TITLE: Record<AlertKind, string> = {
  hub_offline: 'Heating: hub not reporting',
  zone_offline: 'Heating: thermostat offline',
  frost: 'Heating: frost risk',
  low_battery: 'Heating: low battery',
  not_heating: 'Heating: room not warming up',
  empty_room_heating: 'Heating: empty room being heated',
}

/** Today's date in the house's timezone, YYYY-MM-DD. */
function todayLondon(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now)
}

/**
 * Works out which alerts should be open, opens new ones (notifying
 * admins), and resolves ones that no longer apply. Called after every
 * bridge report and by the watchdog (/api/heating/check).
 */
export async function runHeatingChecks({ now }: { now: Date }): Promise<{
  opened: number
  resolved: number
}> {
  const admin = createAdminClient()

  const [hubRes, zonesRes, openRes] = await Promise.all([
    admin.from('heating_hub').select('last_seen_at').eq('id', 1).maybeSingle(),
    admin
      .from('heating_zones')
      .select(
        'id, name, room_id, current_temp, set_temp, heat_on, offline, low_battery, rooms(is_owner_room)',
      )
      .eq('is_hidden', false),
    admin
      .from('heating_alerts')
      .select('id, kind, zone_id')
      .is('resolved_at', null),
  ])

  const lastSeen = (hubRes.data as any)?.last_seen_at as string | null
  const hubOffline =
    !lastSeen || now.getTime() - new Date(lastSeen).getTime() > HUB_OFFLINE_AFTER_MS
  const zones = (zonesRes.data as any[]) ?? []
  const open = (openRes.data as any[]) ?? []
  const openKey = (kind: string, zoneId: string | null) => `${kind}:${zoneId ?? ''}`
  const openKeys = new Set(open.map((a) => openKey(a.kind, a.zone_id)))

  const wanted: WantedAlert[] = []

  if (hubOffline && lastSeen) {
    wanted.push({
      kind: 'hub_offline',
      zone_id: null,
      message: `No heating data since ${new Date(lastSeen).toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        dateStyle: 'medium',
        timeStyle: 'short',
      })}. Check the bridge and the neoHub have power and internet.`,
    })
  }

  // With the hub silent the zone data is stale: leave zone alerts as they are.
  if (!hubOffline) {
    const heatingZoneIds = zones
      .filter((z) => z.heat_on && !z.offline)
      .map((z) => z.id as string)
    const since = new Date(now.getTime() - (NOT_HEATING_WINDOW_MIN + 10) * 60_000)
    const { data: recent } =
      heatingZoneIds.length > 0
        ? await admin
            .from('heating_readings')
            .select('zone_id, recorded_at, current_temp, set_temp, heat_on')
            .in('zone_id', heatingZoneIds)
            .gte('recorded_at', since.toISOString())
            .order('recorded_at')
        : { data: [] }
    const byZone = new Map<string, any[]>()
    for (const r of (recent as any[]) ?? []) {
      const list = byZone.get(r.zone_id) ?? []
      list.push(r)
      byZone.set(r.zone_id, list)
    }

    const today = todayLondon(now)
    const { count: guestStays } = await admin
      .from('booking_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .lte('check_in', today)
      .gt('check_out', today)
    const houseHasGuests = (guestStays ?? 0) > 0

    for (const z of zones) {
      const cur = z.current_temp === null ? null : Number(z.current_temp)
      const set = z.set_temp === null ? null : Number(z.set_temp)

      if (z.offline) {
        wanted.push({
          kind: 'zone_offline',
          zone_id: z.id,
          message: `${z.name} thermostat isn't talking to the hub.`,
        })
        continue
      }
      if (z.low_battery) {
        wanted.push({
          kind: 'low_battery',
          zone_id: z.id,
          message: `${z.name} thermostat needs new batteries.`,
        })
      }
      if (cur !== null) {
        const frostOpen = openKeys.has(openKey('frost', z.id))
        if (cur < FROST_OPEN_BELOW || (frostOpen && cur < FROST_CLEAR_AT)) {
          wanted.push({
            kind: 'frost',
            zone_id: z.id,
            message: `${z.name} is ${cur.toFixed(1)}°C. Pipes can freeze below about 5°C.`,
          })
        }
      }

      const history = byZone.get(z.id) ?? []
      if (z.heat_on && cur !== null && set !== null && history.length >= 2) {
        const first = history[0]
        const spanMin =
          (now.getTime() - new Date(first.recorded_at).getTime()) / 60_000
        const allCalling = history.every((r) => r.heat_on)
        const rise = cur - Number(first.current_temp ?? cur)
        if (
          spanMin >= NOT_HEATING_WINDOW_MIN - 10 &&
          allCalling &&
          set - cur >= NOT_HEATING_GAP &&
          rise < 0.5
        ) {
          wanted.push({
            kind: 'not_heating',
            zone_id: z.id,
            message: `${z.name} has called for heat for 2 hours but is still ${cur.toFixed(
              1,
            )}°C (set ${set.toFixed(1)}°C). Check the boiler, valves or a window.`,
          })
        }
      }

      const isGuestRoom = z.room_id && z.rooms && z.rooms.is_owner_room === false
      if (
        isGuestRoom &&
        !houseHasGuests &&
        z.heat_on &&
        set !== null &&
        set >= EMPTY_ROOM_SETPOINT
      ) {
        wanted.push({
          kind: 'empty_room_heating',
          zone_id: z.id,
          message: `${z.name} is heating to ${set.toFixed(1)}°C with no guests booked today.`,
        })
      }
    }
  }

  const wantedKeys = new Set(wanted.map((w) => openKey(w.kind, w.zone_id)))
  const zoneAlertKinds = new Set<AlertKind>([
    'zone_offline',
    'frost',
    'low_battery',
    'not_heating',
    'empty_room_heating',
  ])

  const toResolve = open.filter((a) => {
    if (wantedKeys.has(openKey(a.kind, a.zone_id))) return false
    if (hubOffline && zoneAlertKinds.has(a.kind)) return false
    return true
  })
  if (toResolve.length > 0) {
    await admin
      .from('heating_alerts')
      .update({ resolved_at: now.toISOString() } as any)
      .in(
        'id',
        toResolve.map((a) => a.id),
      )
  }

  const toOpen = wanted.filter((w) => !openKeys.has(openKey(w.kind, w.zone_id)))
  let opened = 0
  if (toOpen.length > 0) {
    const adminIds = await getAdminIds()
    for (const w of toOpen) {
      // The partial unique index stops a duplicate if two checks race.
      const { error } = await admin.from('heating_alerts').insert(w as any)
      if (error) continue
      opened++
      await notifyUsers(adminIds, {
        title: ALERT_TITLE[w.kind],
        body: w.message,
        url: '/heating',
        tag: `heating-${w.kind}-${w.zone_id ?? 'hub'}`,
      })
    }
  }

  return { opened, resolved: toResolve.length }
}

async function getAdminIds(): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('is_deleted', false)
  return ((data as any[]) ?? []).map((p) => p.id as string)
}

import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Heatmiser neoHub integration — app side.
 *
 * The hub is LAN-only, so heating-relay/ (running at the house) polls
 * it and talks to /api/heating/sync. This module holds the shared
 * types, the parser for the hub's GET_LIVE_DATA payload, and the read
 * helpers for the admin page.
 */

export const HEATING_COMMAND_KINDS = [
  'set_temp',
  'hold',
  'cancel_hold',
  'frost_on',
  'frost_off',
  'away_on',
  'away_off',
] as const

export type HeatingCommandKind = (typeof HEATING_COMMAND_KINDS)[number]

/** Commands that act on the whole hub rather than one zone. */
export const HUB_WIDE_KINDS: HeatingCommandKind[] = ['away_on', 'away_off']

export type HeatingZone = {
  zone_name: string
  actual_temp: number | null
  set_temp: number | null
  heat_on: boolean
  hold_on: boolean
  hold_temp: number | null
  hold_time: string | null
  frost_on: boolean
  window_open: boolean
  low_battery: boolean
  offline: boolean
  updated_at: string
}

export type HeatingHubStatus = {
  last_seen_at: string | null
  hub_away: boolean
  hub_holiday: boolean
  error: string | null
}

export type HeatingCommand = {
  id: string
  kind: HeatingCommandKind
  zone_name: string | null
  temp: number | null
  minutes: number | null
  status: 'pending' | 'sent' | 'done' | 'failed'
  result: string | null
  created_at: string
  completed_at: string | null
}

export type HeatingReading = {
  zone_name: string
  recorded_at: string
  actual_temp: number | null
  set_temp: number | null
  heat_on: boolean
}

/** Relay is considered offline if it hasn't reported for this long. */
export const RELAY_STALE_MINUTES = 15

// ─── Parsing the hub's GET_LIVE_DATA response ──────────────────────────────

type ZoneSnapshot = Omit<HeatingZone, 'updated_at'>

/** The hub reports numbers as strings ("20.5") or numbers; normalise. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null
}

function bool(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true'
}

/**
 * Pull thermostat zones out of a GET_LIVE_DATA payload. Devices with
 * no ACTUAL_TEMP (repeaters, plugs, timeclocks) are skipped.
 */
export function parseLiveData(live: unknown): {
  hubAway: boolean
  hubHoliday: boolean
  zones: ZoneSnapshot[]
} {
  const obj = (live ?? {}) as Record<string, unknown>
  const devices = Array.isArray(obj.devices) ? obj.devices : []
  const zones: ZoneSnapshot[] = []
  for (const raw of devices) {
    const d = (raw ?? {}) as Record<string, unknown>
    const name = typeof d.ZONE_NAME === 'string' ? d.ZONE_NAME.trim() : ''
    if (!name || name.length > 100) continue
    const actual = num(d.ACTUAL_TEMP)
    if (actual === null) continue
    zones.push({
      zone_name: name,
      actual_temp: actual,
      set_temp: num(d.SET_TEMP),
      heat_on: bool(d.HEAT_ON),
      hold_on: bool(d.HOLD_ON),
      hold_temp: num(d.HOLD_TEMP),
      hold_time: typeof d.HOLD_TIME === 'string' ? d.HOLD_TIME : null,
      frost_on: bool(d.STANDBY),
      window_open: bool(d.WINDOW_OPEN),
      low_battery: bool(d.LOW_BATTERY),
      offline: bool(d.OFFLINE),
    })
  }
  return {
    hubAway: bool(obj.HUB_AWAY),
    hubHoliday: bool(obj.HUB_HOLIDAY),
    zones,
  }
}

// ─── Reads for the admin page (RLS: admin only) ────────────────────────────

export async function getHeatingOverview(): Promise<{
  hub: HeatingHubStatus
  /** ms since the relay last reported live data; null if never. */
  lastSeenAgeMs: number | null
  zones: HeatingZone[]
  readings: HeatingReading[]
  commands: HeatingCommand[]
}> {
  const supabase = await createClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [hubRes, zonesRes, readingsRes, commandsRes] = await Promise.all([
    supabase
      .from('heating_hub_status')
      .select('last_seen_at, hub_away, hub_holiday, error')
      .eq('id', 'singleton')
      .maybeSingle(),
    supabase
      .from('heating_zones')
      .select(
        'zone_name, actual_temp, set_temp, heat_on, hold_on, hold_temp, hold_time, frost_on, window_open, low_battery, offline, updated_at',
      )
      .order('zone_name'),
    supabase
      .from('heating_readings')
      .select('zone_name, recorded_at, actual_temp, set_temp, heat_on')
      .gte('recorded_at', since)
      .order('recorded_at'),
    supabase
      .from('heating_commands')
      .select(
        'id, kind, zone_name, temp, minutes, status, result, created_at, completed_at',
      )
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  const hub = (hubRes.data as HeatingHubStatus | null) ?? {
    last_seen_at: null,
    hub_away: false,
    hub_holiday: false,
    error: null,
  }

  return {
    hub,
    lastSeenAgeMs: hub.last_seen_at
      ? Date.now() - new Date(hub.last_seen_at).getTime()
      : null,
    zones: ((zonesRes.data as HeatingZone[] | null) ?? []).map(numericZone),
    readings: ((readingsRes.data as HeatingReading[] | null) ?? []).map(
      (r) => ({
        ...r,
        actual_temp: num(r.actual_temp),
        set_temp: num(r.set_temp),
      }),
    ),
    commands: (commandsRes.data as HeatingCommand[] | null) ?? [],
  }
}

/** PostgREST returns `numeric` columns as strings — coerce back. */
function numericZone(z: HeatingZone): HeatingZone {
  return {
    ...z,
    actual_temp: num(z.actual_temp),
    set_temp: num(z.set_temp),
    hold_temp: num(z.hold_temp),
  }
}

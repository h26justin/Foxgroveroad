import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { addDaysISO, todayISO } from '@/lib/dates'

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

export type HeatingForecastDay = { date: string; min: number; max: number }

export type HeatingHubStatus = {
  last_seen_at: string | null
  hub_away: boolean
  hub_holiday: boolean
  error: string | null
  outdoor_temp: number | null
  forecast: HeatingForecastDay[] | null
}

/** Output of heating_zone_models() — see db/11_heating.sql §8. */
export type HeatingZoneModel = {
  zone_name: string
  samples: number
  heating_share: number | null
  /** Heat loss, per hour per °C warmer than outside. */
  k: number | null
  /** Warming from the heating, °C per hour while on. */
  h: number | null
  /** Background gains (sun, people), °C per hour. */
  c: number | null
  r2: number | null
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

export type HeatingDay = {
  zone_name: string
  day: string
  avg_temp: number | null
  avg_outdoor: number | null
  heating_hours: number
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
  models: HeatingZoneModel[]
  days: HeatingDay[]
}> {
  const supabase = await createClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [hubRes, zonesRes, readingsRes, commandsRes, modelsRes, daysRes] = await Promise.all([
    supabase
      .from('heating_hub_status')
      .select('last_seen_at, hub_away, hub_holiday, error, outdoor_temp, forecast')
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
    supabase.rpc('heating_zone_models', { p_days: MODEL_WINDOW_DAYS }),
    supabase
      .from('heating_daily')
      .select('zone_name, day, avg_temp, avg_outdoor, heating_hours')
      .gte('day', addDaysISO(todayISO(), -7))
      .order('day'),
  ])

  const hubRow = hubRes.data as HeatingHubStatus | null
  const hub: HeatingHubStatus = hubRow
    ? { ...hubRow, outdoor_temp: num(hubRow.outdoor_temp) }
    : {
        last_seen_at: null,
        hub_away: false,
        hub_holiday: false,
        error: null,
        outdoor_temp: null,
        forecast: null,
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
    models: ((modelsRes.data as HeatingZoneModel[] | null) ?? []).map((m) => ({
      ...m,
      samples: Number(m.samples),
      heating_share: num(m.heating_share),
      k: num4(m.k),
      h: num(m.h),
      c: num(m.c),
      r2: num(m.r2),
    })),
    days: ((daysRes.data as HeatingDay[] | null) ?? []).map((d) => ({
      ...d,
      avg_temp: num(d.avg_temp),
      avg_outdoor: num(d.avg_outdoor),
      heating_hours: Number(d.heating_hours) || 0,
    })),
  }
}

/** Like num() but keeps 4 decimals (k is small, e.g. 0.0812). */
function num4(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

// ─── Thermal model predictions ─────────────────────────────────────────────
//
// The model (fitted in SQL) is  dT/dt = -k·(T - T_out) + h·on + c.
// Everything below is that equation solved for the question being asked.

/** How many days of readings the model is fitted over. */
export const MODEL_WINDOW_DAYS = 28

/**
 * A model is only trusted once it has enough data and physically
 * sensible coefficients. ~200 samples ≈ a day of readings; we also need
 * the heating to have been both on and off, and a reasonable fit.
 */
export function isModelUsable(m: HeatingZoneModel | undefined): m is HeatingZoneModel & {
  k: number
  h: number
  c: number
} {
  return (
    !!m &&
    m.samples >= 600 &&
    m.k !== null && m.k > 0.005 && m.k < 2 &&
    m.h !== null && m.h > 0.05 &&
    m.c !== null &&
    m.heating_share !== null && m.heating_share > 0.02 && m.heating_share < 0.98 &&
    (m.r2 ?? 0) > 0.2
  )
}

type Model = { k: number; h: number; c: number }

/**
 * Fraction of the time the heating has to run to hold `target` when it's
 * `outdoor` outside (0–1). Above 1 means the heating can't keep up.
 */
export function dutyCycle(m: Model, target: number, outdoor: number): number {
  const needed = m.k * (target - outdoor) - m.c
  return Math.max(0, needed / m.h)
}

/** Hours of heating per day to hold `target` all day at `outdoor`. */
export function heatingHoursPerDay(m: Model, target: number, outdoor: number): number {
  return 24 * Math.min(1, dutyCycle(m, target, outdoor))
}

/** Temperature the room would settle at with heating on (or off). */
export function equilibrium(m: Model, outdoor: number, heatingOn: boolean): number {
  return outdoor + ((heatingOn ? m.h : 0) + m.c) / m.k
}

/**
 * Minutes of continuous heating to warm from `from` to `to`, or null if
 * the room can't get there at this outdoor temperature.
 */
export function warmUpMinutes(m: Model, from: number, to: number, outdoor: number): number | null {
  if (to <= from) return 0
  const eq = equilibrium(m, outdoor, true)
  if (to >= eq) return null
  return (Math.log((eq - from) / (eq - to)) / m.k) * 60
}

/**
 * Hours for the room to cool from `from` to `to` with the heating off,
 * or null if it would never get that cold (sun/background gains).
 */
export function coolDownHours(m: Model, from: number, to: number, outdoor: number): number | null {
  if (to >= from) return 0
  const eq = equilibrium(m, outdoor, false)
  if (to <= eq) return null
  return Math.log((from - eq) / (to - eq)) / m.k
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

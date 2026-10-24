import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isFeatureEnabled } from '@/lib/feature-flags'
import HeatingClient, {
  type Alert,
  type Command,
  type Reading,
  type Zone,
} from './HeatingClient'

export const dynamic = 'force-dynamic'

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

export default async function HeatingPage() {
  const profile = await requireProfile()
  if (profile.role !== 'admin' && profile.role !== 'family') redirect('/house')
  if (!(await isFeatureEnabled('heating'))) redirect('/dashboard')

  const isAdmin = profile.role === 'admin'
  const supabase = await createClient()
  const since = hoursAgoIso(24)

  const [hubRes, zonesRes, readingsRes, alertsRes, commandsRes, reportRes, roomsRes] =
    await Promise.all([
      supabase
        .from('heating_hub')
        .select('last_seen_at, away, holiday, bridge_version')
        .eq('id', 1)
        .maybeSingle(),
      supabase
        .from('heating_zones')
        .select(
          'id, name, room_id, is_hidden, current_temp, set_temp, heat_on, offline, low_battery, hold_on, hold_temp, standby, updated_at',
        )
        .order('name'),
      supabase
        .from('heating_readings')
        .select('zone_id, recorded_at, current_temp, set_temp')
        .gte('recorded_at', since)
        .order('recorded_at')
        .limit(10000),
      supabase
        .from('heating_alerts')
        .select('id, kind, zone_id, message, opened_at, resolved_at')
        .order('opened_at', { ascending: false })
        .limit(20),
      supabase
        .from('heating_commands')
        .select('id, kind, zone_id, temp, minutes, status, error, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('heating_reports')
        .select('period_start, period_end, body, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      isAdmin
        ? supabase.from('rooms').select('id, name').order('name')
        : Promise.resolve({ data: [] as any[] }),
    ])

  const zones: Zone[] = ((zonesRes.data as any[]) ?? [])
    .filter((z) => isAdmin || !z.is_hidden)
    .map((z) => ({
      id: z.id,
      name: z.name,
      room_id: z.room_id,
      is_hidden: !!z.is_hidden,
      current_temp: z.current_temp === null ? null : Number(z.current_temp),
      set_temp: z.set_temp === null ? null : Number(z.set_temp),
      heat_on: !!z.heat_on,
      offline: !!z.offline,
      low_battery: !!z.low_battery,
      hold_on: !!z.hold_on,
      hold_temp: z.hold_temp === null ? null : Number(z.hold_temp),
      standby: !!z.standby,
    }))

  const readings: Reading[] = ((readingsRes.data as any[]) ?? []).map((r) => ({
    zone_id: r.zone_id,
    t: new Date(r.recorded_at).getTime(),
    cur: r.current_temp === null ? null : Number(r.current_temp),
    set: r.set_temp === null ? null : Number(r.set_temp),
  }))

  const alerts: Alert[] = ((alertsRes.data as any[]) ?? []).map((a) => ({
    id: a.id,
    kind: a.kind,
    zone_id: a.zone_id,
    message: a.message,
    opened_at: a.opened_at,
    resolved_at: a.resolved_at,
  }))

  const commands: Command[] = ((commandsRes.data as any[]) ?? []).map((c) => ({
    id: c.id,
    kind: c.kind,
    zone_id: c.zone_id,
    temp: c.temp === null ? null : Number(c.temp),
    minutes: c.minutes,
    status: c.status,
    error: c.error,
    created_at: c.created_at,
  }))

  const hub = (hubRes.data as any) ?? null
  const report = (reportRes.data as any) ?? null

  return (
    <HeatingClient
      isAdmin={isAdmin}
      hub={
        hub
          ? {
              last_seen_at: hub.last_seen_at,
              away: !!hub.away,
              holiday: !!hub.holiday,
              bridge_version: hub.bridge_version,
            }
          : null
      }
      zones={zones}
      readings={readings}
      alerts={alerts}
      commands={commands}
      report={
        report
          ? {
              period_start: report.period_start,
              period_end: report.period_end,
              body: report.body,
            }
          : null
      }
      rooms={((roomsRes.data as any[]) ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
      }))}
    />
  )
}

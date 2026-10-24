'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { logAdminAction } from '@/lib/audit'
import { isFeatureEnabled } from '@/lib/feature-flags'
import {
  HOLD_MAX_MINUTES,
  HOLD_MAX_TEMP,
  HOLD_MIN_MINUTES,
  HOLD_MIN_TEMP,
  isCommandSafeZoneName,
} from '@/lib/heating-limits'

type Result = { ok?: true; error?: string }

/**
 * Admin-only. Each action queues a row in heating_commands; the bridge
 * in the house picks it up on its next check-in (within about a minute)
 * and reports back. Nothing here talks to the neoHub directly.
 */

async function zoneForCommand(zoneId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('heating_zones')
    .select('id, name, offline')
    .eq('id', zoneId)
    .maybeSingle()
  return data as { id: string; name: string; offline: boolean } | null
}

export async function queueHold(
  zoneId: string,
  temp: number,
  minutes: number,
): Promise<Result> {
  const me = await requireAdmin()
  if (!(await isFeatureEnabled('heating'))) return { error: 'Heating is turned off' }

  if (!Number.isFinite(temp) || temp < HOLD_MIN_TEMP || temp > HOLD_MAX_TEMP) {
    return { error: `Pick a temperature between ${HOLD_MIN_TEMP} and ${HOLD_MAX_TEMP}°C` }
  }
  if (
    !Number.isInteger(minutes) ||
    minutes < HOLD_MIN_MINUTES ||
    minutes > HOLD_MAX_MINUTES
  ) {
    return { error: 'Pick a duration between 15 minutes and 12 hours' }
  }
  const zone = await zoneForCommand(zoneId)
  if (!zone) return { error: 'Zone not found' }
  if (!isCommandSafeZoneName(zone.name)) {
    return { error: 'Rename this zone in the Heatmiser app (no quote marks) to control it here' }
  }

  const supabase = await createClient()
  const roundedTemp = Math.round(temp * 2) / 2
  const { error } = await supabase.from('heating_commands').insert({
    kind: 'hold',
    zone_id: zone.id,
    temp: roundedTemp,
    minutes,
    requested_by: me.id,
  } as any)
  if (error) return { error: error.message }

  await logAdminAction({
    actorId: me.id,
    action: 'heating.hold',
    targetKind: 'heating_zone',
    targetId: zone.id,
    payload: { zone: zone.name, temp: roundedTemp, minutes },
  })
  revalidatePath('/heating')
  return { ok: true }
}

export async function queueCancelHold(zoneId: string): Promise<Result> {
  const me = await requireAdmin()
  if (!(await isFeatureEnabled('heating'))) return { error: 'Heating is turned off' }
  const zone = await zoneForCommand(zoneId)
  if (!zone) return { error: 'Zone not found' }
  if (!isCommandSafeZoneName(zone.name)) {
    return { error: 'Rename this zone in the Heatmiser app (no quote marks) to control it here' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('heating_commands').insert({
    kind: 'cancel_hold',
    zone_id: zone.id,
    requested_by: me.id,
  } as any)
  if (error) return { error: error.message }

  await logAdminAction({
    actorId: me.id,
    action: 'heating.cancel_hold',
    targetKind: 'heating_zone',
    targetId: zone.id,
    payload: { zone: zone.name },
  })
  revalidatePath('/heating')
  return { ok: true }
}

export async function queueAway(on: boolean): Promise<Result> {
  const me = await requireAdmin()
  if (!(await isFeatureEnabled('heating'))) return { error: 'Heating is turned off' }

  const supabase = await createClient()
  const { error } = await supabase.from('heating_commands').insert({
    kind: on ? 'away_on' : 'away_off',
    requested_by: me.id,
  } as any)
  if (error) return { error: error.message }

  await logAdminAction({
    actorId: me.id,
    action: on ? 'heating.away_on' : 'heating.away_off',
    targetKind: 'heating_hub',
  })
  revalidatePath('/heating')
  return { ok: true }
}

export async function updateZoneSettings(
  zoneId: string,
  roomId: string | null,
  isHidden: boolean,
): Promise<Result> {
  await requireAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('heating_zones')
    .update({ room_id: roomId || null, is_hidden: isHidden } as any)
    .eq('id', zoneId)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Zone not found' }
  revalidatePath('/heating')
  return { ok: true }
}

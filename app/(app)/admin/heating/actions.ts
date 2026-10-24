'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { logAdminAction } from '@/lib/audit'
import {
  HEATING_COMMAND_KINDS,
  HUB_WIDE_KINDS,
  type HeatingCommandKind,
} from '@/lib/heating'

/**
 * Queue a heating change for the relay to pick up. Nothing talks to
 * the hub directly from here — the relay polls /api/heating/sync,
 * runs the command on the LAN, and reports the result back.
 */
export async function queueHeatingCommand(formData: FormData) {
  const me = await requireAdmin()

  const kind = String(formData.get('kind') ?? '') as HeatingCommandKind
  if (!HEATING_COMMAND_KINDS.includes(kind)) fail('Unknown heating command')

  const hubWide = HUB_WIDE_KINDS.includes(kind)
  const zoneName = hubWide ? null : String(formData.get('zone_name') ?? '').trim()
  if (!hubWide) {
    // The relay embeds the zone name in the hub's command string, which
    // is quoted with single quotes — reject anything that would break it.
    if (!zoneName || zoneName.length > 100 || /['"\\]/.test(zoneName)) {
      fail('Invalid zone')
    }
  }

  let temp: number | null = null
  if (kind === 'set_temp' || kind === 'hold') {
    temp = Number(formData.get('temp'))
    if (!Number.isInteger(temp) || temp < 5 || temp > 30) {
      fail('Temperature must be a whole number between 5 and 30°C')
    }
  }

  let minutes: number | null = null
  if (kind === 'hold') {
    const hours = Number(formData.get('hours'))
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      fail('Hold must be between 1 and 24 hours')
    }
    minutes = Math.round(hours * 60)
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('heating_commands')
    .insert({
      kind,
      zone_name: zoneName,
      temp,
      minutes,
      requested_by: me.id,
    })
    .select('id')
    .single()

  if (error) fail(error.message)

  await logAdminAction({
    actorId: me.id,
    action: `heating.${kind}`,
    targetKind: 'heating_command',
    targetId: (data as { id: string } | null)?.id ?? null,
    payload: { zone_name: zoneName, temp, minutes },
  })

  revalidatePath('/admin/heating')
  redirect('/admin/heating?queued=1')
}

function fail(message: string): never {
  redirect(`/admin/heating?error=${encodeURIComponent(message)}`)
}

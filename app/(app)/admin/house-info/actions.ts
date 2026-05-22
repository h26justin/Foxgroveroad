'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { HOUSE_SETTING_KEYS, type HouseSettingKey } from '@/lib/house-settings'

export async function updateHouseSettings(formData: FormData) {
  const me = await requireAdmin()
  const supabase = await createClient()

  const updates: { key: HouseSettingKey; value: string }[] = []
  for (const key of HOUSE_SETTING_KEYS) {
    const raw = formData.get(key)
    if (raw === null) continue
    const value = String(raw).trim().slice(0, 2000)
    updates.push({ key, value })
  }

  // Upsert each row. House settings is tiny — N round-trips is fine.
  for (const u of updates) {
    const { error } = await supabase
      .from('house_settings')
      .upsert(
        {
          key: u.key,
          value: u.value,
          updated_by: me.id,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: 'key' },
      )
    if (error) {
      redirect(`/admin/house-info?error=${encodeURIComponent(error.message)}`)
    }
  }

  revalidatePath('/admin/house-info')
  redirect('/admin/house-info?saved=1')
}

import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import LinenClient from './LinenClient'
import { redirect } from 'next/navigation'

export const revalidate = 0

export default async function LinenPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const profile = await requireProfile()
  // Family users don't need linen — gate to admin/cleaner
  if (profile.role !== 'admin' && profile.role !== 'cleaner') {
    redirect('/housekeeping')
  }
  const sp = await searchParams
  const supabase = await createClient()

  // Rooms with their beds — used to compute expected counts and for display
  const { data: roomsRaw } = await supabase
    .from('rooms')
    .select('id, name, floor, room_type, beds(id, name, bed_type)')
    .neq('room_type', 'global')
    .order('floor', { ascending: false })
    .order('name')

  // Existing linen rows
  const { data: linenRaw } = await supabase
    .from('room_linen')
    .select(
      'id, room_id, item_type, size, expected_count, clean_count, dirty_count, washing_count, notes, updated_at'
    )

  return (
    <LinenClient
      profile={profile}
      rooms={(roomsRaw as any[]) ?? []}
      linen={(linenRaw as any[]) ?? []}
      savedMessage={sp.saved ?? null}
      errorMessage={sp.error ?? null}
    />
  )
}

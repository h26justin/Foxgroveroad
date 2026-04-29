import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import LinenClient from './LinenClient'
import { redirect } from 'next/navigation'

// 30s soft cache. Mutations call revalidatePath('/linen') so anything
// changed by *this* user is reflected immediately.
export const revalidate = 30

export default async function LinenPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const [profile, sp, supabase] = await Promise.all([
    requireProfile(),
    searchParams,
    createClient(),
  ])
  // Family users don't need linen — gate to admin/cleaner
  if (profile.role !== 'admin' && profile.role !== 'cleaner') {
    redirect('/housekeeping')
  }

  // Both queries are independent
  const [roomsRes, linenRes] = await Promise.all([
    supabase
      .from('rooms')
      .select('id, name, floor, room_type, beds(id, name, bed_type)')
      .neq('room_type', 'global')
      .order('floor', { ascending: false })
      .order('name'),
    supabase
      .from('room_linen')
      .select(
        'id, room_id, item_type, size, expected_count, clean_count, dirty_count, washing_count, notes, updated_at'
      ),
  ])

  return (
    <LinenClient
      profile={profile}
      rooms={(roomsRes.data as any[]) ?? []}
      linen={(linenRes.data as any[]) ?? []}
      savedMessage={sp.saved ?? null}
      errorMessage={sp.error ?? null}
    />
  )
}

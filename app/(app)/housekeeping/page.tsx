import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import HousekeepingClient from './HousekeepingClient'

// 30s soft cache. Actions that mutate data call revalidatePath('/housekeeping')
// so any tick/edit by *this* user busts the cache immediately. The 30s ceiling
// just means a tick from another device may take up to 30s to appear.
export const revalidate = 30

export default async function HousekeepingPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; error?: string }>
}) {
  // Resolve auth + searchParams + supabase client in parallel
  const [profile, sp, supabase] = await Promise.all([
    requireProfile(),
    searchParams,
    createClient(),
  ])

  const today = new Date().toISOString().split('T')[0]

  // All four data queries are independent — fire them in parallel.
  const [dueRowsRes, completionsRes, roomsRes, roomOrderRes] = await Promise.all([
    supabase
      .from('cleaner_tasks_today')
      .select(
        'id, name, notes, frequency_days, is_turnaround, task_kind, room_id, room_name, floor, room_type, last_completed_date, room_state, status, days_overdue'
      )
      .in('status', ['overdue', 'due'])
      .order('days_overdue', { ascending: false })
      .order('name', { ascending: true }),
    supabase
      .from('task_completions')
      .select(
        'id, completed_at, completed_by, task_template_id, task_templates!inner(id, name, room_id, rooms!inner(id, name))'
      )
      .eq('completed_at_date', today)
      .order('completed_at', { ascending: false }),
    supabase
      .from('rooms')
      .select('id, name, floor, room_type')
      .order('floor', { ascending: false })
      .order('name'),
    supabase
      .from('user_room_order')
      .select('room_id, position')
      .eq('user_id', profile.id)
      .order('position'),
  ])

  return (
    <HousekeepingClient
      dueTasks={(dueRowsRes.data as any[]) ?? []}
      completions={(completionsRes.data as any[]) ?? []}
      rooms={(roomsRes.data as any[]) ?? []}
      roomOrder={(roomOrderRes.data as any[]) ?? []}
      profile={profile}
      activeRoomId={sp.room ?? null}
      errorMessage={sp.error ?? null}
    />
  )
}

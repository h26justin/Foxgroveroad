import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import HousekeepingClient from './HousekeepingClient'

export const revalidate = 0

export default async function HousekeepingPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; done?: string; error?: string }>
}) {
  const profile = await requireProfile()
  const sp = await searchParams
  const supabase = await createClient()

  // 1) Due/overdue tasks from the view.
  const { data: dueRowsRaw } = await supabase
    .from('cleaner_tasks_today')
    .select(
      'id, name, notes, frequency_days, is_turnaround, room_id, room_name, floor, room_type, last_completed_date, status, days_overdue'
    )
    .in('status', ['overdue', 'due'])
    .order('days_overdue', { ascending: false })
    .order('name', { ascending: true })

  // 2) Today's completions, joined to template + room for inline display.
  // (Supabase's TS inference is too pessimistic on FK joins — cast to any.)
  const today = new Date().toISOString().split('T')[0]
  const { data: completionsRaw } = await supabase
    .from('task_completions')
    .select(
      'id, completed_at, completed_by, task_template_id, task_templates!inner(id, name, room_id, rooms!inner(id, name))'
    )
    .eq('completed_at_date', today)
    .order('completed_at', { ascending: false })

  // 3) All rooms (so the chip strip can include rooms with 0 due tasks).
  const { data: roomsRaw } = await supabase
    .from('rooms')
    .select('id, name, floor, room_type')
    .order('floor', { ascending: false })
    .order('name')

  return (
    <HousekeepingClient
      dueTasks={(dueRowsRaw as any[]) ?? []}
      completions={(completionsRaw as any[]) ?? []}
      rooms={(roomsRaw as any[]) ?? []}
      profile={profile}
      activeRoomId={sp.room ?? null}
      doneCompletionId={sp.done ?? null}
      errorMessage={sp.error ?? null}
    />
  )
}

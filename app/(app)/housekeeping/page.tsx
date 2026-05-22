import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getFeatureFlags } from '@/lib/feature-flags'
import { getAllRoomStatuses } from '@/lib/room-status'
import { annotatePlants, type Plant, type PlantWatering } from '@/lib/plants'
import {
  getCleanerForProfile,
  recentSelfLogsForCleaner,
  mondayOfWeek,
} from '@/lib/cleaner-self-log'
import HousekeepingClient from './HousekeepingClient'
import LogHoursWidget from './LogHoursWidget'

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
  // 5-day window for pre-arrival prep
  const fiveDaysOut = (() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() + 5)
    return d.toISOString().split('T')[0]
  })()

  // Seven queries fire in parallel.
  //
  // The "all completions" query is a defensive override: the
  // cleaner_tasks_today view computes last_completed_date itself, but
  // we've seen cases where its value is stale even after revalidation.
  // We query task_completions directly and override the view's value
  // per task. This is cheap (text-only data, indexed by template).
  const [
    dueRowsRes,
    completionsRes,
    roomsRes,
    roomOrderRes,
    openIssuesRes,
    upcomingBookingsRes,
    prearrivalTemplatesRes,
    allCompletionsRes,
    plantsRes,
    plantWateringsRes,
    roomStatusesMap,
  ] = await Promise.all([
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
    supabase
      .from('issues')
      .select('id, room_id')
      .eq('status', 'open'),
    supabase
      .from('bookings')
      .select(
        'id, bed_id, check_in, check_out, request_id, guest_name, beds:beds!bookings_bed_id_fkey(room_id), profiles:profiles!bookings_requested_by_fkey(full_name)'
      )
      .eq('status', 'approved')
      .gte('check_in', today)
      .lte('check_in', fiveDaysOut)
      .order('check_in'),
    supabase
      .from('prearrival_templates')
      .select('id, room_id, name, position')
      .order('position'),
    // Defensive: the most recent completion per task. Read all
    // completions (template_id + completed_at_date) and reduce to a
    // map client-side. Limited to past 365 days to keep size bounded.
    (() => {
      const yearAgo = (() => {
        const d = new Date(today + 'T00:00:00')
        d.setDate(d.getDate() - 365)
        return d.toISOString().split('T')[0]
      })()
      return supabase
        .from('task_completions')
        .select('task_template_id, completed_at_date')
        .gte('completed_at_date', yearAgo)
        .order('completed_at_date', { ascending: false })
    })(),
    // v34: plants + recent waterings (last 60d gives enough headroom
    // even for monthly-watered plants)
    supabase
      .from('plants')
      .select('id, name, location, frequency_days, notes, position')
      .order('position'),
    (() => {
      const sixtyDaysAgo = (() => {
        const d = new Date(today + 'T00:00:00')
        d.setDate(d.getDate() - 60)
        return d.toISOString().split('T')[0]
      })()
      return supabase
        .from('plant_waterings')
        .select('id, plant_id, watered_by, watered_at, watered_at_date')
        .gte('watered_at_date', sixtyDaysAgo)
        .order('watered_at', { ascending: false })
    })(),
    // Moved into the parallel batch — it was previously awaited inline
    // in JSX, which forced an extra round-trip after everything above
    // had already resolved.
    getAllRoomStatuses(supabase, today),
  ])

  // Build map of task_template_id → most recent completion date
  const lastCompletedByTemplate = new Map<string, string>()
  for (const c of (allCompletionsRes.data as any[]) ?? []) {
    if (!c.task_template_id) continue
    const existing = lastCompletedByTemplate.get(c.task_template_id)
    if (!existing || c.completed_at_date > existing) {
      lastCompletedByTemplate.set(c.task_template_id, c.completed_at_date)
    }
  }

  // v23: pending one-shot tasks + their photos. Admin + cleaner only;
  // family users don't see these. v27: also gated on feature flag.
  const flags = await getFeatureFlags()
  const oneshotTasksEnabled = flags['oneshot_tasks'] !== false
  const isAdminOrCleaner =
    profile.role === 'admin' || profile.role === 'cleaner'
  type OneshotRow = {
    id: string
    description: string
    priority: 'normal' | 'urgent'
    room_id: string | null
    room_name: string | null
    created_at: string
    created_by_name: string
    photos: any[]
  }
  let oneshotTasks: OneshotRow[] = []
  if (isAdminOrCleaner && oneshotTasksEnabled) {
    const { data: oneshotRows } = await supabase
      .from('oneshot_tasks')
      .select(
        'id, description, priority, room_id, created_at, rooms:rooms!oneshot_tasks_room_id_fkey(name), creator:profiles!oneshot_tasks_created_by_fkey(full_name)',
      )
      .eq('status', 'pending')
      .order('priority', { ascending: false }) // urgent first (urgent > normal alphabetically)
      .order('created_at', { ascending: false })

    const oneshots = (oneshotRows as any[]) ?? []
    let photosMap = new Map<string, any[]>()
    if (oneshots.length > 0) {
      // Reuse listAttachmentsForEntities pattern
      const { listAttachmentsForEntities } = await import(
        '@/lib/attachments'
      )
      photosMap = await listAttachmentsForEntities(
        'oneshot_task',
        oneshots.map((o) => o.id),
      )
    }
    oneshotTasks = oneshots.map((o) => ({
      id: o.id,
      description: o.description,
      priority: (o.priority === 'urgent' ? 'urgent' : 'normal') as
        | 'normal'
        | 'urgent',
      room_id: o.room_id,
      room_name: (o.rooms as any)?.name ?? null,
      created_at: o.created_at,
      created_by_name: (o.creator as any)?.full_name ?? 'Admin',
      photos: photosMap.get(o.id) ?? [],
    }))
  }

  // Apply override to dueTasks: replace last_completed_date, and filter
  // out tasks that have been completed recently enough that they
  // shouldn't be in the due/overdue list. Don't trust the view's status
  // alone — its computation can lag actual completions.
  const dueRows = ((dueRowsRes.data as any[]) ?? [])
    .map((t) => {
      const real = lastCompletedByTemplate.get(t.id)
      if (!real) return t // nothing in completions, view's value stands
      const daysSince = Math.floor(
        (new Date(today + 'T00:00:00').getTime() -
          new Date(real + 'T00:00:00').getTime()) /
          86400000,
      )
      const freq = t.frequency_days ?? 0
      // If the task has a frequency and it's been completed within the
      // window, it shouldn't show as due. Mark it for filtering by
      // returning null.
      if (freq > 0 && daysSince < freq) {
        return null
      }
      return {
        ...t,
        last_completed_date: real,
        // Recompute days_overdue from real completion. If freq is 0
        // (one-shot), days_overdue is just daysSince.
        days_overdue: freq > 0 ? Math.max(0, daysSince - freq) : daysSince,
      }
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)

  // Build a per-room open-issues count from the open issues list.
  const openIssuesByRoom = new Map<string, number>()
  for (const i of (openIssuesRes.data as any[]) ?? []) {
    if (!i.room_id) continue
    openIssuesByRoom.set(i.room_id, (openIssuesByRoom.get(i.room_id) ?? 0) + 1)
  }
  const openIssuesCount: Record<string, number> = {}
  for (const [k, v] of openIssuesByRoom) openIssuesCount[k] = v

  // Fetch existing pre-arrival checks for the request IDs we found.
  const upcomingBookings = (upcomingBookingsRes.data as any[]) ?? []
  const upcomingRequestIds = Array.from(
    new Set(upcomingBookings.map((b) => b.request_id).filter(Boolean))
  )
  let checks: any[] = []
  if (upcomingRequestIds.length > 0) {
    const { data: checksData } = await supabase
      .from('prearrival_checks')
      .select('id, booking_request_id, template_id, room_id')
      .in('booking_request_id', upcomingRequestIds)
    checks = (checksData as any[]) ?? []
  }

  // Build "soonest upcoming booking per room" — there can be multiple
  // bookings for the same room across the window; we surface the
  // earliest one only.
  const soonestPerRoom = new Map<
    string,
    {
      request_id: string
      room_id: string
      check_in: string
      check_out: string
      guest_name: string | null
      requester_name: string | null
    }
  >()
  for (const b of upcomingBookings) {
    const roomId = (b.beds as any)?.room_id
    const requestId = b.request_id
    if (!roomId || !requestId) continue
    const existing = soonestPerRoom.get(roomId)
    if (!existing || b.check_in < existing.check_in) {
      soonestPerRoom.set(roomId, {
        request_id: requestId,
        room_id: roomId,
        check_in: b.check_in,
        check_out: b.check_out,
        guest_name: b.guest_name,
        requester_name: (b.profiles as any)?.full_name ?? null,
      })
    }
  }

  // Build per-room pre-arrival data: { templates[], checkedTemplateIds[], booking-info }
  const prearrivalByRoom: Record<
    string,
    {
      request_id: string
      check_in: string
      check_out: string
      guest_label: string
      templates: { id: string; name: string; position: number }[]
      checkedTemplateIds: string[]
    }
  > = {}

  const allTemplates = (prearrivalTemplatesRes.data as any[]) ?? []
  for (const [roomId, info] of soonestPerRoom) {
    const templates = allTemplates
      .filter((t) => t.room_id === roomId)
      .map((t) => ({ id: t.id, name: t.name, position: t.position }))
    if (templates.length === 0) continue // no checklist for this room
    const checkedTemplateIds = checks
      .filter(
        (c) =>
          c.booking_request_id === info.request_id && c.room_id === roomId
      )
      .map((c) => c.template_id)
    const guestLabel =
      info.guest_name ?? info.requester_name ?? 'a guest'
    prearrivalByRoom[roomId] = {
      request_id: info.request_id,
      check_in: info.check_in,
      check_out: info.check_out,
      guest_label: guestLabel,
      templates,
      checkedTemplateIds,
    }
  }

  // v34: derive plant statuses
  const annotatedPlants = annotatePlants(
    ((plantsRes.data as any[]) ?? []) as Plant[],
    ((plantWateringsRes.data as any[]) ?? []) as PlantWatering[],
    today,
  )

  // v41: cleaner self-log widget. Only shown if the user has a linked
  // cleaner record. Admin users can also have a cleaner record (when
  // they fill in for the team) — we don't gate by role.
  const cleaner = await getCleanerForProfile(profile.id)
  let cleanerLogs: { id: string; date: string; hours: number; notes: string | null }[] = []
  let weekTotal = 0
  if (cleaner) {
    const monday = mondayOfWeek(today)
    const logs = await recentSelfLogsForCleaner(cleaner.id, 14)
    cleanerLogs = logs
    weekTotal = logs
      .filter((l) => l.date >= monday)
      .reduce((acc, l) => acc + l.hours, 0)
  }

  return (
    <>
      {cleaner && (
        <LogHoursWidget
          cleanerName={cleaner.name}
          recentLogs={cleanerLogs}
          weekTotal={weekTotal}
          today={today}
        />
      )}
      <HousekeepingClient
      dueTasks={dueRows}
      completions={(completionsRes.data as any[]) ?? []}
      rooms={(roomsRes.data as any[]) ?? []}
      roomOrder={(roomOrderRes.data as any[]) ?? []}
      openIssuesCount={openIssuesCount}
      prearrivalByRoom={prearrivalByRoom}
      oneshotTasks={oneshotTasks}
      oneshotTasksEnabled={oneshotTasksEnabled}
      profile={profile}
      activeRoomId={sp.room ?? null}
      errorMessage={sp.error ?? null}
      plants={annotatedPlants}
      roomStatuses={Object.fromEntries(roomStatusesMap)}
    />
    </>
  )
}

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
  // 5-day window for pre-arrival prep
  const fiveDaysOut = (() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() + 5)
    return d.toISOString().split('T')[0]
  })()

  // Six queries fire in parallel — adds upcoming bookings + pre-arrival
  // templates + existing checks for the v16 prearrival-on-housekeeping feature.
  const [
    dueRowsRes,
    completionsRes,
    roomsRes,
    roomOrderRes,
    openIssuesRes,
    upcomingBookingsRes,
    prearrivalTemplatesRes,
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
    // Bookings whose check-in is between today and five days out — these
    // are the active "prep this room" prompts. Joined to beds for room_id
    // and to booking_requests for the dates and the request id we'll FK
    // pre-arrival checks against.
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
  ])

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

  return (
    <HousekeepingClient
      dueTasks={(dueRowsRes.data as any[]) ?? []}
      completions={(completionsRes.data as any[]) ?? []}
      rooms={(roomsRes.data as any[]) ?? []}
      roomOrder={(roomOrderRes.data as any[]) ?? []}
      openIssuesCount={openIssuesCount}
      prearrivalByRoom={prearrivalByRoom}
      profile={profile}
      activeRoomId={sp.room ?? null}
      errorMessage={sp.error ?? null}
    />
  )
}

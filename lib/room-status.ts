/**
 * Bedroom status lights (v31).
 *
 * Each bedroom resolves to one of three states, derived purely from
 * existing data (no extra DB columns, no manual override yet):
 *
 *   orange — a guest's approved booking spans today
 *   red    — last guest's check-out is recent and turnaround tasks
 *            haven't been completed since
 *   green  — anything else (truly empty, or turnaround done)
 *
 * The "recent" window defaults to 7 days. Beyond that we assume the
 * room is fine — if a clean has been outstanding for over a week,
 * the cleaning rota itself is broken and a status light won't help.
 *
 * Edge cases:
 *   - Room with no turnaround task templates → green after checkout
 *     (we have nothing to mark as outstanding)
 *   - Same-day checkout + check-in → orange (the new booking wins)
 */

export type RoomStatus = 'green' | 'orange' | 'red'

export type RoomStatusInfo = {
  status: RoomStatus
  reason: string
}

export const STATUS_LABEL: Record<RoomStatus, string> = {
  green: 'Ready',
  orange: 'Occupied',
  red: 'Needs cleaning',
}

const STALENESS_DAYS = 7

/**
 * Fetch all bedroom statuses in one batched query.
 * Returns a Map keyed by room.id.
 *
 * Caller passes a Supabase server client (the one with the user's
 * session). RLS applies — but bedrooms, bookings, task templates and
 * task completions are all readable to admin/cleaner/family by your
 * existing policies, so this works for any authed page.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAllRoomStatuses(
  supabase: any,
  today: string,
): Promise<Map<string, RoomStatusInfo>> {
  const stalenessFrom = (() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() - STALENESS_DAYS)
    return d.toISOString().split('T')[0]
  })()

  const [roomsRes, bookingsRes, templatesRes, completionsRes] =
    await Promise.all([
      supabase
        .from('rooms')
        .select('id')
        .eq('room_type', 'bedroom'),
      // Approved bookings whose check-out is within the staleness
      // window — covers both "currently in-house" and "recently
      // checked out" in a single query.
      supabase
        .from('bookings')
        .select(
          'check_in, check_out, guest_name, beds:beds!bookings_bed_id_fkey(room_id)',
        )
        .eq('status', 'approved')
        .gte('check_out', stalenessFrom),
      supabase
        .from('task_templates')
        .select('id, room_id')
        .eq('is_turnaround', true),
      supabase
        .from('task_completions')
        .select('task_template_id, completed_at_date')
        .gte('completed_at_date', stalenessFrom),
    ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rooms = (roomsRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookingsRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const templates = (templatesRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completions = (completionsRes.data ?? []) as any[]

  // Index turnaround templates by room
  const templatesByRoom = new Map<string, string[]>()
  for (const t of templates) {
    if (!t.room_id) continue
    const list = templatesByRoom.get(t.room_id) ?? []
    list.push(t.id)
    templatesByRoom.set(t.room_id, list)
  }

  // Index completions by template (collect all dates per template)
  const completionsByTemplate = new Map<string, string[]>()
  for (const c of completions) {
    if (!c.task_template_id) continue
    const list = completionsByTemplate.get(c.task_template_id) ?? []
    list.push(c.completed_at_date)
    completionsByTemplate.set(c.task_template_id, list)
  }

  // Walk bookings: collect rooms occupied today + most recent
  // recently-past check-out per room.
  const occupiedNow = new Map<string, string | null>() // roomId → guest name
  const lastCheckoutByRoom = new Map<string, string>() // roomId → date
  for (const b of bookings) {
    const roomId = (b.beds as any)?.room_id
    if (!roomId) continue

    if (b.check_in <= today && b.check_out > today) {
      const prev = occupiedNow.get(roomId)
      // First name we hit is fine — there can be multiple beds in a
      // room with different guests, but for status display a single
      // representative is enough
      if (prev === undefined) occupiedNow.set(roomId, b.guest_name ?? null)
    }

    if (b.check_out <= today && b.check_out > stalenessFrom) {
      const existing = lastCheckoutByRoom.get(roomId)
      if (!existing || b.check_out > existing) {
        lastCheckoutByRoom.set(roomId, b.check_out)
      }
    }
  }

  const out = new Map<string, RoomStatusInfo>()
  for (const r of rooms) {
    if (occupiedNow.has(r.id)) {
      const guest = occupiedNow.get(r.id)
      out.set(r.id, {
        status: 'orange',
        reason: guest ? `Occupied: ${guest}` : 'Occupied',
      })
      continue
    }

    const lastCheckout = lastCheckoutByRoom.get(r.id)
    if (!lastCheckout) {
      out.set(r.id, { status: 'green', reason: 'Ready' })
      continue
    }

    const turnaroundIds = templatesByRoom.get(r.id) ?? []
    if (turnaroundIds.length === 0) {
      out.set(r.id, { status: 'green', reason: 'Ready' })
      continue
    }

    // All turnaround tasks must have a completion on or after the
    // last checkout date.
    const allDone = turnaroundIds.every((tid) => {
      const dates = completionsByTemplate.get(tid) ?? []
      return dates.some((d) => d >= lastCheckout)
    })

    if (allDone) {
      out.set(r.id, { status: 'green', reason: 'Ready · turnaround complete' })
    } else {
      out.set(r.id, {
        status: 'red',
        reason: `Needs cleaning since ${lastCheckout}`,
      })
    }
  }

  return out
}

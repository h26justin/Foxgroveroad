'use server'

import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'

export type AvailabilityResult = {
  totalRooms: number
  occupiedRooms: number
  freeRooms: number
  /** 'green' = nothing booked, 'yellow' = some rooms left, 'red' = full */
  level: 'green' | 'yellow' | 'red'
}

/**
 * Lightweight read-only check used by the family booking form to give
 * users a hint about whether their requested dates are likely to be
 * approved.
 *
 * The numbers are advisory only — the actual approval flow has its own
 * conflict logic on beds. We're just counting how many bedrooms have
 * *any* approved booking overlapping the requested window, vs. how
 * many bedrooms exist in total.
 */
export async function checkAvailability(
  checkIn: string,
  checkOut: string,
): Promise<{ ok: true; data: AvailabilityResult } | { ok: false; error: string }> {
  // Same auth gate as the rest of the booking form — we don't expose
  // availability publicly.
  await requireProfile()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    return { ok: false, error: 'Invalid dates' }
  }
  if (checkIn >= checkOut) {
    return { ok: false, error: 'Check-out must be after check-in' }
  }

  const supabase = await createClient()

  // Two queries in parallel: total bedroom count, and overlapping
  // bookings (so we can dedupe to rooms).
  const [roomsRes, overlapRes] = await Promise.all([
    supabase
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('room_type', 'bedroom'),
    supabase
      .from('bookings')
      .select(
        'id, beds:beds!bookings_bed_id_fkey(room_id)',
      )
      .eq('status', 'approved')
      .lt('check_in', checkOut)
      .gt('check_out', checkIn),
  ])

  const totalRooms = roomsRes.count ?? 0
  const occupied = new Set<string>()
  for (const b of (overlapRes.data as any[]) ?? []) {
    const roomId = (b.beds as any)?.room_id
    if (roomId) occupied.add(roomId)
  }
  const occupiedRooms = occupied.size
  const freeRooms = Math.max(0, totalRooms - occupiedRooms)

  let level: AvailabilityResult['level']
  if (totalRooms === 0) level = 'green'
  else if (occupiedRooms === 0) level = 'green'
  else if (freeRooms === 0) level = 'red'
  else level = 'yellow'

  return {
    ok: true,
    data: { totalRooms, occupiedRooms, freeRooms, level },
  }
}

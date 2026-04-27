'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'

const PILLOWS_PER_BED: Record<string, number> = {
  single: 2,
  double: 4,
  king: 4,
  super_king: 4,
}

const OCCUPANTS_PER_BED: Record<string, number> = {
  single: 1,
  double: 2,
  king: 2,
  super_king: 2,
}

function bedTypeToSize(bedType: string): string {
  // Translate bed_type into a linen "size" label. Singles are single-size
  // bedding; everything else uses the bed_type itself.
  return bedType
}

/**
 * Walks every bedroom + its beds and writes expected linen counts using
 * the 2-sets formula. Idempotent: running it again preserves clean/dirty/
 * washing counts (only updates expected_count).
 */
export async function recomputeLinenFromBeds(): Promise<{
  ok?: true
  inserted?: number
  updated?: number
  error?: string
}> {
  const profile = await requireProfile()
  if (profile.role !== 'admin') {
    return { error: 'Only admins can recompute linen requirements.' }
  }

  const supabase = await createClient()

  // Pull every bedroom and its beds
  const { data: rooms, error: roomsErr } = await supabase
    .from('rooms')
    .select('id, name, room_type, beds(id, name, bed_type)')
    .eq('room_type', 'bedroom')

  if (roomsErr) return { error: roomsErr.message }

  // For each room, compute the expected linen items
  type ItemKey = { room_id: string; item_type: string; size: string | null }
  const computed: (ItemKey & { expected_count: number })[] = []

  for (const room of (rooms ?? []) as any[]) {
    const beds = (room.beds ?? []) as { bed_type: string }[]
    if (beds.length === 0) continue

    let totalOccupants = 0
    // We may have mixed bed sizes in one room (e.g. a double + a single in a
    // family room). Track sizes separately so duvet/sheet sizes match the bed.
    const sizeBedCounts = new Map<string, number>()

    for (const b of beds) {
      const t = b.bed_type
      totalOccupants += OCCUPANTS_PER_BED[t] ?? 1
      const size = bedTypeToSize(t)
      sizeBedCounts.set(size, (sizeBedCounts.get(size) ?? 0) + 1)
    }

    // Pillowcases — one row per bed-size, counted by total pillows for that size
    for (const [size, bedCount] of sizeBedCounts.entries()) {
      const pillowsForSize = bedCount * (PILLOWS_PER_BED[size] ?? 2)
      computed.push({
        room_id: room.id,
        item_type: 'pillowcase',
        size,
        expected_count: pillowsForSize * 2, // 2 sets
      })
      // Duvet covers — one per bed × 2 sets
      computed.push({
        room_id: room.id,
        item_type: 'duvet_cover',
        size,
        expected_count: bedCount * 2,
      })
      // Fitted sheets — one per bed × 2 sets
      computed.push({
        room_id: room.id,
        item_type: 'fitted_sheet',
        size,
        expected_count: bedCount * 2,
      })
    }

    // Towels — sized null because bath/hand towels don't have a bed-size
    computed.push({
      room_id: room.id,
      item_type: 'bath_towel',
      size: null,
      expected_count: totalOccupants * 2,
    })
    computed.push({
      room_id: room.id,
      item_type: 'hand_towel',
      size: null,
      expected_count: totalOccupants * 2,
    })
  }

  // Upsert each computed row by (room_id, item_type, size).
  // NOTE: Supabase's `.is()` only accepts null/true/false, so we branch on
  // size to use `.is(..., null)` for towels (size = null) and `.eq(...)`
  // for sized linen (single, double, king, etc.).
  let inserted = 0
  let updated = 0
  for (const c of computed) {
    let lookup = supabase
      .from('room_linen')
      .select('id')
      .eq('room_id', c.room_id)
      .eq('item_type', c.item_type)
    lookup = c.size === null
      ? lookup.is('size', null)
      : lookup.eq('size', c.size)
    const { data: existing } = await lookup.maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('room_linen')
        .update({
          expected_count: c.expected_count,
          updated_at: new Date().toISOString(),
          updated_by: profile.id,
        })
        .eq('id', (existing as any).id)
      if (error) return { error: error.message }
      updated++
    } else {
      const { error } = await supabase.from('room_linen').insert({
        room_id: c.room_id,
        item_type: c.item_type,
        size: c.size,
        expected_count: c.expected_count,
        updated_by: profile.id,
      })
      if (error) return { error: error.message }
      inserted++
    }
  }

  revalidatePath('/linen')
  return { ok: true, inserted, updated }
}

/** Increment or decrement a linen count by 1 (delta is +1 or -1). */
export async function updateLinenCount(
  linenId: string,
  field: 'clean_count' | 'dirty_count' | 'washing_count',
  delta: number
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireProfile()
  if (profile.role !== 'admin' && profile.role !== 'cleaner') {
    return { error: 'Only admins and cleaners can update linen counts.' }
  }
  if (!linenId) return { error: 'Missing linen id' }
  if (delta !== 1 && delta !== -1) return { error: 'Invalid delta' }

  const supabase = await createClient()

  // Read current value, mutate, write
  const { data: row, error: readErr } = await supabase
    .from('room_linen')
    .select('id, clean_count, dirty_count, washing_count')
    .eq('id', linenId)
    .single()

  if (readErr || !row) return { error: readErr?.message ?? 'Not found' }

  const currentVal = (row as any)[field] as number
  const newVal = Math.max(0, currentVal + delta)

  const { error: writeErr } = await supabase
    .from('room_linen')
    .update({
      [field]: newVal,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq('id', linenId)

  if (writeErr) return { error: writeErr.message }

  revalidatePath('/linen')
  return { ok: true }
}

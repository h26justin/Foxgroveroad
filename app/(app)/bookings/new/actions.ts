'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { todayISO } from '@/lib/dates'

type AgeBand = 'infant' | 'toddler' | 'child'
type SleepArrangement = 'cot' | 'own_bed' | 'sharing_with_parent'

type ChildPayload = {
  age_band: AgeBand
  sleep_arrangement: SleepArrangement
  position: number
}

const VALID_AGE_BANDS: AgeBand[] = ['infant', 'toddler', 'child']
const VALID_SLEEP: SleepArrangement[] = ['cot', 'own_bed', 'sharing_with_parent']

// Mirror of the DB CHECK constraint — keeps server in sync with DB
function isValidArrangement(age: AgeBand, sleep: SleepArrangement): boolean {
  if (age === 'infant') return sleep === 'cot'
  if (age === 'toddler') return sleep === 'cot' || sleep === 'own_bed'
  if (age === 'child') return sleep === 'own_bed' || sleep === 'sharing_with_parent'
  return false
}

export async function createBookingRequest(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const checkIn = String(formData.get('check_in') ?? '')
  const checkOut = String(formData.get('check_out') ?? '')
  const adults = parseInt(String(formData.get('adults') ?? '0'), 10)
  const adultsSharing = String(formData.get('adults_sharing') ?? '1') === '1'
  const notes = String(formData.get('notes') ?? '').trim() || null

  // Parse children_json
  let childrenPayload: ChildPayload[] = []
  try {
    const raw = String(formData.get('children_json') ?? '[]')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      childrenPayload = parsed.map((c, idx) => ({
        age_band: c.age_band as AgeBand,
        sleep_arrangement: c.sleep_arrangement as SleepArrangement,
        position: typeof c.position === 'number' ? c.position : idx,
      }))
    }
  } catch {
    childrenPayload = []
  }

  // Validation
  const errors: string[] = []
  if (!checkIn || !checkOut) errors.push('Both dates are required.')
  if (checkIn && checkOut && checkOut <= checkIn)
    errors.push('Check-out must be after check-in.')
  if (checkIn && checkIn < todayISO())
    errors.push("Check-in can't be in the past.")
  if (!Number.isFinite(adults) || adults < 1)
    errors.push('At least one adult required.')
  if (adults > 10)
    errors.push("More than 10 adults — please call us instead.")

  // Per-child validation
  for (const [i, c] of childrenPayload.entries()) {
    if (!VALID_AGE_BANDS.includes(c.age_band))
      errors.push(`Child ${i + 1}: invalid age.`)
    if (!VALID_SLEEP.includes(c.sleep_arrangement))
      errors.push(`Child ${i + 1}: invalid sleeping arrangement.`)
    if (
      VALID_AGE_BANDS.includes(c.age_band) &&
      VALID_SLEEP.includes(c.sleep_arrangement) &&
      !isValidArrangement(c.age_band, c.sleep_arrangement)
    ) {
      errors.push(
        `Child ${i + 1}: ${c.age_band}s can't be in a ${c.sleep_arrangement.replace(/_/g, ' ')}.`
      )
    }
  }

  // Total guest sanity check (Foxgrove sleeps up to ~9 in beds)
  const childrenInBeds = childrenPayload.filter(
    (c) => c.sleep_arrangement === 'own_bed'
  ).length
  if (adults + childrenInBeds > 9)
    errors.push(
      'Too many guests needing beds (max 9). Move someone to sharing or cot, or call us.'
    )

  if (errors.length > 0) {
    redirect(
      `/bookings/new?error=${encodeURIComponent(errors.join(' '))}`
    )
  }

  // Insert the request first
  const { data: created, error: insertErr } = await supabase
    .from('booking_requests')
    .insert({
      requested_by: user.id,
      check_in: checkIn,
      check_out: checkOut,
      adults,
      children: childrenPayload.length,
      adults_sharing: adultsSharing,
      notes,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertErr || !created) {
    redirect(
      `/bookings/new?error=${encodeURIComponent(insertErr?.message ?? 'Could not save request')}`
    )
  }

  // Now insert children rows (if any)
  if (childrenPayload.length > 0) {
    const childRows = childrenPayload.map((c, i) => ({
      request_id: (created as any).id,
      age_band: c.age_band,
      sleep_arrangement: c.sleep_arrangement,
      position: i,
    }))

    const { error: childErr } = await supabase
      .from('booking_request_children')
      .insert(childRows)

    if (childErr) {
      // Roll back the request so we don't leave it without children data
      await supabase
        .from('booking_requests')
        .delete()
        .eq('id', (created as any).id)
      redirect(
        `/bookings/new?error=${encodeURIComponent('Could not save children: ' + childErr.message)}`
      )
    }
  }

  revalidatePath('/bookings')
  revalidatePath('/house')
  revalidatePath('/dashboard')
  revalidatePath('/admin/bookings')
  redirect('/bookings?success=1')
}

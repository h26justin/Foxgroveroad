'use server'

import { randomBytes } from 'crypto'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Issue a fresh arrival-packet token for a booking request. The old
 * link stops working immediately.
 *
 * Ownership is checked with the user's own client (RLS only returns
 * the caller's requests, or all of them for an admin). The write uses
 * the service role because requesters can't update an approved request
 * under RLS.
 */
export async function regenerateArrivalToken(formData: FormData) {
  await requireProfile()
  const requestId = String(formData.get('request_id') ?? '')

  const supabase = await createClient()
  const { data: request } = await supabase
    .from('booking_requests')
    .select('id')
    .eq('id', requestId)
    .eq('status', 'approved')
    .maybeSingle()
  if (!request) {
    redirect(`/bookings?error=${encodeURIComponent('Booking not found')}`)
  }

  const { error } = await createAdminClient()
    .from('booking_requests')
    .update({ arrival_token: randomBytes(24).toString('hex') })
    .eq('id', requestId)
  if (error) {
    redirect(`/bookings?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/bookings')
  redirect('/bookings?saved=1')
}

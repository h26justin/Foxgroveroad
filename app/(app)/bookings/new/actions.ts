'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { todayISO } from '@/lib/dates'

export async function createBookingRequest(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const checkIn = String(formData.get('check_in') ?? '')
  const checkOut = String(formData.get('check_out') ?? '')
  const adults = parseInt(String(formData.get('adults') ?? '0'), 10)
  const children = parseInt(String(formData.get('children') ?? '0'), 10)
  const notes = String(formData.get('notes') ?? '').trim() || null

  // Validation
  const errors: string[] = []
  if (!checkIn || !checkOut) errors.push('Both dates are required.')
  if (checkIn && checkOut && checkOut <= checkIn)
    errors.push('Check-out must be after check-in.')
  if (checkIn && checkIn < todayISO())
    errors.push("Check-in can't be in the past.")
  if (!Number.isFinite(adults) || adults < 1)
    errors.push('At least one adult required.')
  if (!Number.isFinite(children) || children < 0)
    errors.push('Children count must be 0 or more.')
  if (adults + children > 16)
    errors.push("That's a lot of guests — please call us instead.")

  if (errors.length > 0) {
    redirect(
      `/bookings/new?error=${encodeURIComponent(errors.join(' '))}`
    )
  }

  const { error } = await supabase.from('booking_requests').insert({
    requested_by: user.id,
    check_in: checkIn,
    check_out: checkOut,
    adults,
    children,
    notes,
    status: 'pending',
  })

  if (error) {
    redirect(
      `/bookings/new?error=${encodeURIComponent(error.message)}`
    )
  }

  revalidatePath('/bookings')
  revalidatePath('/dashboard')
  revalidatePath('/admin/bookings')
  redirect('/bookings?success=1')
}

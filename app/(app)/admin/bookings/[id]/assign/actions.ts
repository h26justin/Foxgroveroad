'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function assignBeds(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requestId = String(formData.get('request_id') ?? '')
  const bedIds = formData.getAll('bed_ids').map(String).filter(Boolean)

  if (!requestId) {
    redirect('/admin/bookings')
  }

  // Fetch the request for dates + requester
  const { data: req, error: fetchErr } = await supabase
    .from('booking_requests')
    .select(
      'id, requested_by, check_in, check_out, status, profiles:profiles!booking_requests_requested_by_fkey(full_name)'
    )
    .eq('id', requestId)
    .single()

  if (fetchErr || !req) {
    redirect(
      `/admin/bookings?error=${encodeURIComponent('Request not found')}`
    )
  }

  if (req.status !== 'approved') {
    redirect(
      `/admin/bookings/${requestId}/assign?error=${encodeURIComponent(
        'Approve the request before assigning beds.'
      )}`
    )
  }

  const guestName =
    (req.profiles as any)?.full_name ?? 'Family guest'

  // Wipe existing bookings tied to this request, then create fresh ones
  const { error: deleteErr } = await supabase
    .from('bookings')
    .delete()
    .eq('request_id', requestId)

  if (deleteErr) {
    redirect(
      `/admin/bookings/${requestId}/assign?error=${encodeURIComponent(
        deleteErr.message
      )}`
    )
  }

  if (bedIds.length === 0) {
    revalidatePath('/admin/bookings')
    revalidatePath('/house')
    redirect(
      `/admin/bookings/${requestId}/assign?saved=${encodeURIComponent(
        'Assignment cleared.'
      )}`
    )
  }

  const rows = bedIds.map((bedId) => ({
    bed_id: bedId,
    request_id: requestId,
    requested_by: req.requested_by,
    guest_name: guestName,
    check_in: req.check_in,
    check_out: req.check_out,
    status: 'approved' as const,
    approved_at: new Date().toISOString(),
    approved_by: user.id,
  }))

  const { error: insertErr } = await supabase.from('bookings').insert(rows)

  if (insertErr) {
    redirect(
      `/admin/bookings/${requestId}/assign?error=${encodeURIComponent(
        insertErr.message
      )}`
    )
  }

  revalidatePath('/admin/bookings')
  revalidatePath('/house')
  revalidatePath('/dashboard')
  redirect(
    `/admin/bookings/${requestId}/assign?saved=${encodeURIComponent(
      `${bedIds.length} bed${bedIds.length === 1 ? '' : 's'} assigned.`
    )}`
  )
}

export async function unassignBeds(formData: FormData) {
  const supabase = await createClient()
  const requestId = String(formData.get('request_id') ?? '')
  if (!requestId) redirect('/admin/bookings')

  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('request_id', requestId)

  if (error) {
    redirect(
      `/admin/bookings/${requestId}/assign?error=${encodeURIComponent(
        error.message
      )}`
    )
  }

  revalidatePath('/admin/bookings')
  revalidatePath('/house')
  redirect(
    `/admin/bookings/${requestId}/assign?saved=${encodeURIComponent(
      'All bed assignments cleared.'
    )}`
  )
}

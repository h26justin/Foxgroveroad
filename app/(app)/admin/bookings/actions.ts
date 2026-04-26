'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function approveRequest(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/admin/bookings')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS will reject if not admin
  const { error } = await supabase
    .from('booking_requests')
    .update({
      status: 'approved',
      decided_at: new Date().toISOString(),
      decided_by: user.id,
    })
    .eq('id', id)
    .eq('status', 'pending')

  if (error) {
    redirect(
      `/admin/bookings?error=${encodeURIComponent(error.message)}`
    )
  }

  revalidatePath('/admin/bookings')
  revalidatePath('/dashboard')
  revalidatePath('/bookings')
  redirect('/admin/bookings?approved=1')
}

export async function declineRequest(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim() || null
  if (!id) redirect('/admin/bookings')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('booking_requests')
    .update({
      status: 'declined',
      admin_notes: reason,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
    })
    .eq('id', id)
    .eq('status', 'pending')

  if (error) {
    redirect(
      `/admin/bookings?error=${encodeURIComponent(error.message)}`
    )
  }

  revalidatePath('/admin/bookings')
  revalidatePath('/dashboard')
  revalidatePath('/bookings')
  redirect('/admin/bookings?declined=1')
}

'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function cancelBooking(formData: FormData) {
  await requireAdmin()
  const id = String(formData.get('id') || '').trim()
  const reason = String(formData.get('reason') || '').trim() || null

  if (!id) {
    redirect(`/admin/bookings?error=Missing+booking+id`)
  }

  const supabase = await createClient()

  const { data: existing, error: readErr } = await supabase
    .from('bookings')
    .select('id, status, notes')
    .eq('id', id)
    .maybeSingle()

  if (readErr || !existing) {
    redirect(`/admin/bookings/${id}?error=Booking+not+found`)
  }

  if (existing.status !== 'approved') {
    redirect(
      `/admin/bookings/${id}?error=Only+approved+bookings+can+be+cancelled`
    )
  }

  const updatedNotes = reason
    ? `${existing.notes ? existing.notes + '\n' : ''}[Cancelled] ${reason}`
    : existing.notes

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', notes: updatedNotes })
    .eq('id', id)

  if (error) {
    redirect(
      `/admin/bookings/${id}?error=${encodeURIComponent(error.message)}`
    )
  }

  revalidatePath('/admin/bookings')
  revalidatePath('/house')
  revalidatePath(`/admin/bookings/${id}`)
  redirect(`/admin/bookings/${id}?success=Booking+cancelled`)
}

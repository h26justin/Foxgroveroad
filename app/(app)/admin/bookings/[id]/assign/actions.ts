'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/**
 * Replace the bed assignments for an approved request. The delete and
 * insert happen in one database transaction (fg_replace_bed_assignments,
 * db/12) so a failed insert — e.g. the overlap trigger rejecting a bed —
 * leaves the previous assignment intact instead of wiping it.
 */
export async function assignBeds(formData: FormData) {
  await requireAdmin()

  const requestId = String(formData.get('request_id') ?? '')
  const bedIds = formData.getAll('bed_ids').map(String).filter(Boolean)
  if (!requestId) redirect('/admin/bookings')

  const count = await replaceAssignments(requestId, bedIds)

  redirect(
    `/admin/bookings/${requestId}/assign?saved=${encodeURIComponent(
      count === 0
        ? 'Assignment cleared.'
        : `${count} bed${count === 1 ? '' : 's'} assigned.`,
    )}`,
  )
}

export async function unassignBeds(formData: FormData) {
  await requireAdmin()

  const requestId = String(formData.get('request_id') ?? '')
  if (!requestId) redirect('/admin/bookings')

  await replaceAssignments(requestId, [])

  redirect(
    `/admin/bookings/${requestId}/assign?saved=${encodeURIComponent(
      'All bed assignments cleared.',
    )}`,
  )
}

async function replaceAssignments(requestId: string, bedIds: string[]) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fg_replace_bed_assignments', {
    p_request_id: requestId,
    p_bed_ids: bedIds,
  })

  if (error) {
    redirect(
      `/admin/bookings/${requestId}/assign?error=${encodeURIComponent(error.message)}`,
    )
  }

  revalidatePath('/admin/bookings')
  revalidatePath('/house')
  revalidatePath('/dashboard')
  return Number(data ?? 0)
}

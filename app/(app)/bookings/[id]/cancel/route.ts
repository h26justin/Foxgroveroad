import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  }

  // Verify ownership + status before cancelling. RLS would also block,
  // but we want to give a clear redirect on failure.
  const { data: req } = await supabase
    .from('booking_requests')
    .select('id, status, requested_by')
    .eq('id', id)
    .eq('requested_by', user.id)
    .maybeSingle()

  if (!req || (req.status !== 'pending' && req.status !== 'approved')) {
    // Either not theirs, or already terminal
    return NextResponse.redirect(
      new URL('/bookings?cancelled=0', request.url),
      { status: 303 },
    )
  }

  // Mark cancelled
  await supabase
    .from('booking_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('requested_by', user.id)
    .in('status', ['pending', 'approved'])

  // If the request was approved, also free up its bed assignments.
  // Otherwise the calendar would still show the cancelled booking
  // sitting in beds.
  if (req.status === 'approved') {
    await supabase.from('bookings').delete().eq('request_id', id)
  }

  revalidatePath('/bookings')
  revalidatePath('/house')
  revalidatePath('/dashboard')
  revalidatePath('/admin/bookings')

  return NextResponse.redirect(
    new URL('/bookings?cancelled=1', request.url),
    { status: 303 },
  )
}

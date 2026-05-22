import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // CSRF: require the Origin header to match the request's own origin.
  // Server Actions get this for free; route handlers don't.
  const requestUrl = new URL(request.url)
  const origin = request.headers.get('origin')
  if (!origin || new URL(origin).origin !== requestUrl.origin) {
    return new NextResponse('Bad origin', { status: 403 })
  }

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

  // Always clear bed assignments, regardless of the stale status we read
  // above. If the request was approved between our read and our update,
  // the bookings rows now exist and we still want them gone. Deleting
  // when there's nothing to delete is a cheap no-op.
  await supabase.from('bookings').delete().eq('request_id', id)

  revalidatePath('/bookings')
  revalidatePath('/house')
  revalidatePath('/dashboard')
  revalidatePath('/admin/bookings')

  return NextResponse.redirect(
    new URL('/bookings?cancelled=1', request.url),
    { status: 303 },
  )
}

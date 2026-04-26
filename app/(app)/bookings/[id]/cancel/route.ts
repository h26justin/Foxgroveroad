import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  }

  // RLS will prevent cancelling someone else's request OR a non-pending one
  await supabase
    .from('booking_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('requested_by', user.id)
    .eq('status', 'pending')

  revalidatePath('/bookings')
  revalidatePath('/dashboard')
  revalidatePath('/admin/bookings')

  return NextResponse.redirect(
    new URL('/bookings?cancelled=1', request.url),
    { status: 303 }
  )
}

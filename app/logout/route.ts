import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')

  const url = new URL('/login', request.url)
  return NextResponse.redirect(url, { status: 303 })
}

export const GET = POST

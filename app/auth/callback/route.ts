import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextRaw = searchParams.get('next') ?? '/housekeeping'
  // Same open-redirect guard as app/login/actions.ts — reject anything
  // that's not a single-slash relative path.
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/housekeeping'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Could not verify email`)
}

import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// In Next.js 16, `proxy` replaces the old `middleware` convention.
// proxy.ts runs on the Node.js runtime by default, which is what
// @supabase/ssr needs (the older Edge Runtime can't load it).
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Run on every request except static assets
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}

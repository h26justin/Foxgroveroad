import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Wrapped in React's `cache()` so a single request reuses one Supabase
 * client instance — saves repeated cookie reads and client construction
 * across layout + page + helpers.
 *
 * Note: the *underlying client* is reused, but per-request it's a fresh
 * construction (cache() is per-request, not global). This keeps auth
 * cookies isolated per request, which is what we want.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — safely ignored if there's
            // middleware refreshing sessions for you (which there is).
          }
        },
      },
    }
  )
})

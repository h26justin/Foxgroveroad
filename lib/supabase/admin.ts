import 'server-only'
import { createServerClient } from '@supabase/ssr'

/**
 * Returns a Supabase client with the SERVICE ROLE key — bypasses RLS
 * entirely. Use ONLY for genuinely-admin operations like inviting users.
 *
 * SECURITY: this key has god-mode access to the database. Never use it
 * in a client component, never include it in a route handler that
 * isn't auth-gated, and never log it. The 'server-only' import at the
 * top makes Next.js refuse to bundle this file into client code.
 *
 * Always pair calls to this client with a server-side admin check
 * (requireAdmin) BEFORE the call — service role bypasses RLS, so we
 * can't rely on the database to enforce who's allowed to call this.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL not set')
  }
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY not set. Add it in Vercel project settings (Server-side env var) for invite functionality to work.'
    )
  }

  // No cookie handling — service role doesn't represent a user session.
  // We pass empty cookie handlers so @supabase/ssr is happy.
  return createServerClient(url, serviceKey, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {
        // no-op — service role has no session to persist
      },
    },
  })
}

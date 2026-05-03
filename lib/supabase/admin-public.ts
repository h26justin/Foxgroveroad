import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * A second admin client used ONLY for sending auth emails (password
 * reset, magic link). Built on @supabase/supabase-js (NOT @supabase/ssr)
 * with implicit flow.
 *
 * Why a separate client:
 *
 * The regular admin client (createAdminClient in ./admin.ts) uses
 * @supabase/ssr, which defaults to PKCE flow. PKCE works by storing a
 * "code verifier" cookie on the same browser that initiated the
 * request, then exchanging that verifier when the user clicks back.
 *
 * That falls apart for admin-triggered password resets: our admin
 * client runs server-side with no-op cookie handlers, so the verifier
 * has nowhere to go — and even if it were stored somewhere, the
 * recipient's browser (which may be on a different device entirely)
 * doesn't have it. The recovery code exchange always fails.
 *
 * Implicit flow sidesteps this by appending access_token and
 * refresh_token directly to the redirect URL fragment. The recipient's
 * browser client picks them up via detectSessionInUrl. No cookies
 * required to bridge between sender and recipient.
 *
 * Use ONLY for resetPasswordForEmail and signInWithOtp. For database
 * operations and admin user management, use createAdminClient instead.
 */
export function createAdminPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL not set')
  }
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY not set. Add it in Vercel project settings.'
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      flowType: 'implicit',
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

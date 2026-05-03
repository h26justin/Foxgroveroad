'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'

// =====================================================================
// Helpers
// =====================================================================

/**
 * Best-effort site-URL for redirects in emails. Vercel exposes the
 * deployment URL via VERCEL_URL (without protocol). Fall back to the
 * production domain if env vars are missing.
 */
function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`
  return 'https://foxgroveroad.vercel.app'
}

/** Look up auth.users.email for a profile id. */
async function emailFor(profileId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(profileId)
  if (error || !data?.user?.email) return null
  return data.user.email
}

// =====================================================================
// Existing actions
// =====================================================================

export async function setUserRole(formData: FormData) {
  const supabase = await createClient()
  const profileId = String(formData.get('profile_id') ?? '')
  const role = String(formData.get('role') ?? '')

  if (!profileId || !['admin', 'family', 'cleaner'].includes(role)) {
    redirect(`/admin/team?error=${encodeURIComponent('Invalid role')}`)
  }

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', profileId)

  if (error) {
    redirect(`/admin/team?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/team')
  revalidatePath('/', 'layout')
  redirect('/admin/team?saved=1')
}

export async function linkCleanerProfile(formData: FormData) {
  const supabase = await createClient()
  const cleanerId = String(formData.get('cleaner_id') ?? '')
  const profileId = String(formData.get('profile_id') ?? '') || null

  if (!cleanerId) {
    redirect(`/admin/team?error=${encodeURIComponent('Cleaner ID missing')}`)
  }

  const { error } = await supabase
    .from('cleaners')
    .update({ profile_id: profileId })
    .eq('id', cleanerId)

  if (error) {
    redirect(`/admin/team?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/team')
  redirect('/admin/team?saved=1')
}

export async function toggleCleanerActive(formData: FormData) {
  const supabase = await createClient()
  const cleanerId = String(formData.get('cleaner_id') ?? '')
  const newActive = String(formData.get('is_active') ?? '') === 'true'

  if (!cleanerId) {
    redirect(`/admin/team?error=${encodeURIComponent('Cleaner ID missing')}`)
  }

  const { error } = await supabase
    .from('cleaners')
    .update({ is_active: newActive })
    .eq('id', cleanerId)

  if (error) {
    redirect(`/admin/team?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/team')
  redirect('/admin/team?saved=1')
}

// =====================================================================
// v26 — auth admin actions
// =====================================================================

/**
 * Send a password reset email. The link in the email goes via
 * /auth/callback which exchanges the recovery code, then redirects
 * the (now-authenticated) user to /auth/update-password where they
 * type a new password.
 *
 * Used for both "reset another user's password" and "reset my own
 * password" — same flow, different target email.
 */
export async function sendPasswordReset(formData: FormData) {
  await requireAdmin()
  const profileId = String(formData.get('profile_id') ?? '')
  if (!profileId) {
    redirect(`/admin/team?error=${encodeURIComponent('Missing profile')}`)
  }

  const email = await emailFor(profileId)
  if (!email) {
    redirect(
      `/admin/team?error=${encodeURIComponent("Couldn't find that user's email")}`,
    )
  }

  // Use the admin client so we can send even when the request user is
  // not the target user.
  const admin = createAdminClient()
  const redirectTo = `${siteUrl()}/auth/callback?next=${encodeURIComponent('/auth/update-password')}`
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo,
  })
  if (error) {
    redirect(`/admin/team?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/team')
  redirect(
    `/admin/team?saved=${encodeURIComponent(`Reset email sent to ${email}`)}`,
  )
}

/**
 * Send a fresh magic-link login email. Useful when a user is locked
 * out and just needs back in (no password change required).
 *
 * shouldCreateUser=false ensures we don't accidentally create a new
 * account if the email doesn't exist — but we already verified the
 * profile exists above.
 */
export async function sendMagicLink(formData: FormData) {
  await requireAdmin()
  const profileId = String(formData.get('profile_id') ?? '')
  if (!profileId) {
    redirect(`/admin/team?error=${encodeURIComponent('Missing profile')}`)
  }

  const email = await emailFor(profileId)
  if (!email) {
    redirect(
      `/admin/team?error=${encodeURIComponent("Couldn't find that user's email")}`,
    )
  }

  const admin = createAdminClient()
  const emailRedirectTo = `${siteUrl()}/auth/callback?next=${encodeURIComponent('/housekeeping')}`
  const { error } = await admin.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo },
  })
  if (error) {
    redirect(`/admin/team?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/team')
  redirect(
    `/admin/team?saved=${encodeURIComponent(`Login link sent to ${email}`)}`,
  )
}

/**
 * Disable or re-enable a user's account at the auth layer. A disabled
 * user cannot log in or refresh their session. We use a 100-year ban
 * for "disable" and 'none' for re-enable.
 *
 * Cannot disable yourself.
 */
export async function toggleUserBanned(formData: FormData) {
  const me = await requireAdmin()
  const profileId = String(formData.get('profile_id') ?? '')
  const shouldBan = String(formData.get('should_ban') ?? '') === 'true'
  if (!profileId) {
    redirect(`/admin/team?error=${encodeURIComponent('Missing profile')}`)
  }
  if (profileId === me.id) {
    redirect(
      `/admin/team?error=${encodeURIComponent('You cannot disable your own account.')}`,
    )
  }

  const admin = createAdminClient()
  // Cast to any — Supabase JS types for ban_duration are slightly
  // out-of-date in some versions.
  const { error } = await (admin.auth.admin as any).updateUserById(
    profileId,
    {
      ban_duration: shouldBan ? '876000h' : 'none', // ~100 years or unban
    },
  )
  if (error) {
    redirect(`/admin/team?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/team')
  redirect(
    `/admin/team?saved=${encodeURIComponent(shouldBan ? 'Account disabled' : 'Account re-enabled')}`,
  )
}

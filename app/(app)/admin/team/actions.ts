'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAdminPublicClient } from '@/lib/supabase/admin-public'
import { requireAdmin } from '@/lib/auth'

// =====================================================================
// Helpers
// =====================================================================

/**
 * Best-effort site-URL for redirects in emails.
 *
 * Order:
 *   1. NEXT_PUBLIC_SITE_URL (set in Vercel env vars — preferred)
 *   2. The hardcoded production domain (the URL the allow-list lives at)
 *   3. VERCEL_URL — only as a last-ditch fallback
 *
 * VERCEL_URL is the deployment-specific alias (foxgroveroad-h26justin-
 * abc123.vercel.app), which won't match foxgroveroad.vercel.app/** in
 * Supabase's allow-list. Putting it last avoids the silent fallback
 * to bare Site URL we hit pre-v28.
 */
function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')
  // Hardcoded prod URL second — it's the canonical domain registered
  // in the Supabase allow-list, so redirects always match.
  const fallback = 'https://foxgroveroad.vercel.app'
  // Only use VERCEL_URL if neither of the above is available AND it
  // happens to be the canonical domain (defensive: don't use a
  // deployment-specific alias).
  const vercel = process.env.VERCEL_URL
  if (!vercel) return fallback
  return vercel === 'foxgroveroad.vercel.app' ? `https://${vercel}` : fallback
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
 * Send a password reset email. The link in the email goes directly to
 * /auth/update-password with auth tokens in the URL fragment (implicit
 * flow); the page's browser client picks up the session automatically.
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

  // Use the implicit-flow admin client. PKCE doesn't work for admin-
  // triggered resets (verifier ends up on the wrong machine). Implicit
  // flow puts auth tokens directly in the URL fragment, which the
  // recipient's browser client picks up automatically.
  //
  // redirectTo points straight at /auth/update-password — no query
  // string, no callback round-trip. Query strings on redirect URLs
  // can trip Supabase's allow-list matcher even when wildcards are
  // configured, causing the redirect to silently fall back to the
  // bare Site URL.
  const admin = createAdminPublicClient()
  const redirectTo = `${siteUrl()}/auth/update-password`
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

  // Same reasoning as sendPasswordReset above: implicit-flow client,
  // no callback indirection. emailRedirectTo points at /auth/finish-login,
  // a tiny bridge page that consumes the URL fragment and forwards
  // the user to /housekeeping. Going directly to /housekeeping doesn't
  // work because middleware would bounce the (still-anonymous) browser
  // to /login before the client-side hash detection can run.
  const admin = createAdminPublicClient()
  const emailRedirectTo = `${siteUrl()}/auth/finish-login`
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

// =====================================================================
// v29 — soft-delete + email change
// =====================================================================

/**
 * "Delete" a user. We don't actually remove the auth.users row (doing
 * so would cascade-violate every booking/task/issue FK pointing at
 * them). Instead we soft-delete:
 *
 *   1. Ban the auth user (100-year ban) so they can't sign in
 *   2. Rotate their auth email to deleted+{uuid}@deleted.foxgrove.invalid
 *      so the original address is freed for re-invite
 *   3. Mark profiles.is_deleted = true and clear PII (name, phone)
 *      while keeping the row so historical bookings/tasks still
 *      reference a real profile and render naturally as "Deleted user"
 *
 * Requires the admin to type the user's full name as confirmation —
 * single-tap protection on a destructive action.
 *
 * Cannot delete yourself.
 *
 * Reversible if you mis-click: un-ban the auth user, set is_deleted
 * back to false, and restore the name. The auth.users row is
 * preserved either way.
 */
export async function deleteUser(formData: FormData) {
  const me = await requireAdmin()
  const profileId = String(formData.get('profile_id') ?? '')
  const confirmName = String(formData.get('confirm_name') ?? '').trim()

  if (!profileId) {
    redirect(`/admin/team?error=${encodeURIComponent('Missing profile')}`)
  }
  if (profileId === me.id) {
    redirect(
      `/admin/team?error=${encodeURIComponent('You cannot delete your own account.')}`,
    )
  }

  // Look up the profile so we can verify the typed name and use the
  // real name in the success message.
  const supabase = await createClient()
  const { data: profile, error: lookupErr } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', profileId)
    .single()
  if (lookupErr || !profile) {
    redirect(
      `/admin/team?error=${encodeURIComponent("Couldn't find that profile.")}`,
    )
  }

  const realName = (profile as any).full_name as string
  // Name match is case-insensitive and trim-tolerant. Has to match
  // exactly otherwise — partial matches would defeat the safety.
  if (confirmName.toLowerCase() !== realName.toLowerCase()) {
    redirect(
      `/admin/team?error=${encodeURIComponent("Confirmation name didn't match — nothing was deleted.")}`,
    )
  }

  const admin = createAdminClient()

  // Step 1+2: ban the auth user and rotate their email.
  // email_confirm: true marks the new email as already-confirmed, so
  // Supabase doesn't try to send a confirmation message (which would
  // bounce off the .invalid TLD anyway).
  const rotatedEmail = `deleted+${profileId}@deleted.foxgrove.invalid`
  const { error: authErr } = await (admin.auth.admin as any).updateUserById(
    profileId,
    {
      ban_duration: '876000h',
      email: rotatedEmail,
      email_confirm: true,
    },
  )
  if (authErr) {
    redirect(`/admin/team?error=${encodeURIComponent(authErr.message)}`)
  }

  // Step 3: anonymize the profile row. Role is preserved so any
  // historical permission checks against this profile still resolve
  // sensibly. Phone cleared (PII), name replaced with the tombstone.
  const { error: profileErr } = await admin
    .from('profiles')
    .update({
      full_name: 'Deleted user',
      phone: null,
      is_deleted: true,
    } as any)
    .eq('id', profileId)
  if (profileErr) {
    redirect(`/admin/team?error=${encodeURIComponent(profileErr.message)}`)
  }

  revalidatePath('/admin/team')
  redirect(
    `/admin/team?saved=${encodeURIComponent(`Deleted ${realName}'s account`)}`,
  )
}

/**
 * Change the email address on a user's auth record. Useful for fixing
 * typos or migrating someone to a new address.
 *
 * email_confirm: true means we mark the new email as confirmed without
 * sending the user a "please confirm" email. Justified here because
 * (a) the admin is making this change deliberately and (b) we don't
 * always have access to the new mailbox to click a confirm link.
 */
export async function updateUserEmail(formData: FormData) {
  await requireAdmin()
  const profileId = String(formData.get('profile_id') ?? '')
  const newEmail = String(formData.get('new_email') ?? '').trim().toLowerCase()

  if (!profileId) {
    redirect(`/admin/team?error=${encodeURIComponent('Missing profile')}`)
  }
  if (!newEmail || !newEmail.includes('@') || newEmail.length < 5) {
    redirect(
      `/admin/team?error=${encodeURIComponent('Please enter a valid email.')}`,
    )
  }

  const admin = createAdminClient()
  const { error } = await (admin.auth.admin as any).updateUserById(profileId, {
    email: newEmail,
    email_confirm: true,
  })
  if (error) {
    redirect(`/admin/team?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/team')
  redirect(
    `/admin/team?saved=${encodeURIComponent(`Email updated to ${newEmail}`)}`,
  )
}

// =====================================================================
// v30 — pending-approval gate
// =====================================================================

/**
 * Approve a pending signup. Sets their role from 'pending' to whatever
 * the admin picked (default: 'family'). After this they can sign in
 * and access the app normally.
 *
 * Reject is just the existing deleteUser flow with a soft-delete —
 * keeps the auth row but locks them out and frees the email.
 */
export async function approvePendingUser(formData: FormData) {
  await requireAdmin()
  const profileId = String(formData.get('profile_id') ?? '')
  const newRole = String(formData.get('role') ?? 'family')

  if (!profileId) {
    redirect(`/admin/team?error=${encodeURIComponent('Missing profile')}`)
  }
  if (!['admin', 'family', 'cleaner'].includes(newRole)) {
    redirect(
      `/admin/team?error=${encodeURIComponent('Role must be admin, family, or cleaner')}`,
    )
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole } as any)
    .eq('id', profileId)
    .eq('role', 'pending')
  if (error) {
    redirect(`/admin/team?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/team')
  redirect(
    `/admin/team?saved=${encodeURIComponent(`Approved as ${newRole}`)}`,
  )
}

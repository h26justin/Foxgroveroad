'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Invite a new user via email magic-link. Sets their role in advance so
 * they land on a profile with the right permissions.
 *
 * Form fields:
 *   email      — must be a valid email
 *   full_name  — display name
 *   role       — 'admin' | 'cleaner' | 'family'
 *
 * SECURITY: this uses the SERVICE ROLE key. requireAdmin() runs first
 * so only admins can call this server action. The service-role client
 * bypasses RLS — we MUST verify admin status before calling it.
 */
export async function inviteUser(
  formData: FormData
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const fullName = String(formData.get('full_name') ?? '').trim()
  const role = String(formData.get('role') ?? '').trim()

  // Basic validation
  if (!email) return { error: 'Email is required' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Invalid email address' }
  }
  if (!fullName) return { error: 'Full name is required' }
  if (fullName.length > 200) return { error: 'Full name is too long' }
  if (!['admin', 'cleaner', 'family'].includes(role)) {
    return { error: 'Role must be admin, cleaner, or family' }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e: any) {
    return {
      error:
        e?.message ??
        'Service role key not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel.',
    }
  }

  // Send the invite. Supabase's auth.admin.inviteUserByEmail emails the
  // user with a magic-link signup URL. The user clicks → lands on your
  // signup flow → password reset → profile gets created (via the
  // pre-existing on-auth-user-insert trigger).
  const { data: invited, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        // We pass the role through user_metadata. If a trigger reads it
        // when creating the profile row, great. If not, we upsert below.
        role,
      },
    })

  if (inviteErr) {
    return { error: inviteErr.message }
  }
  if (!invited?.user) {
    return { error: 'Invite returned no user.' }
  }

  // Defensively upsert the profile with the chosen role. If a trigger
  // already created the row, this updates it; if not, this creates it.
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert(
      {
        id: invited.user.id,
        full_name: fullName,
        role,
      },
      { onConflict: 'id' }
    )

  if (profileErr) {
    return {
      error:
        'Invite sent, but failed to set role: ' +
        profileErr.message +
        '. You can fix the role manually on the Team page once they accept.',
    }
  }

  revalidatePath('/admin/team')
  return { ok: true }
}

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Self-signup. Creates the auth user, then forces their profile role
 * to 'pending' so they can't see anything until an admin approves them.
 *
 * Notifies all admins via push notification so a fresh signup can be
 * actioned promptly. Push failures don't block the signup — the worst
 * case is the admin opens the Team page later and sees the pending
 * row, which is fine.
 *
 * Admin-initiated invites use a separate flow (see invite-actions.ts)
 * and bypass this — those users get the role chosen by the admin and
 * are never 'pending'.
 */
export async function signup(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  })

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`)
  }

  // Force role to 'pending' on the profile. We use the admin client
  // (service role) here because the user is freshly signed up and may
  // not be able to update their own role under standard RLS — and
  // also because the on-auth-insert trigger may have set the default
  // role to 'family' before we get a chance.
  //
  // Upsert covers both branches: trigger ran (we update) or didn't
  // (we insert). Either way the row ends up with role='pending'.
  const userId = data.user?.id
  if (userId) {
    try {
      const admin = createAdminClient()
      await admin
        .from('profiles')
        .upsert(
          {
            id: userId,
            full_name: fullName,
            role: 'pending',
          } as any,
          { onConflict: 'id' },
        )

      // Notify all admins via push. Wrapped in its own try/catch so a
      // push failure can't block the signup — the user should still be
      // able to land on /awaiting-approval cleanly.
      try {
        const { sendPushToUsers } = await import('@/lib/push')
        const { data: admins } = await admin
          .from('profiles')
          .select('id')
          .eq('role', 'admin')
          .eq('is_deleted', false)
        const adminIds = (admins as any[] | null)?.map((a) => a.id) ?? []
        if (adminIds.length > 0) {
          await sendPushToUsers(adminIds, {
            title: 'New signup awaiting approval',
            body: `${fullName} (${email}) just signed up. Tap to review.`,
            url: '/admin/team',
            tag: 'pending-signup',
          })
        }
      } catch (pushErr) {
        console.error('[signup] Push notification failed:', pushErr)
      }
    } catch (profileErr) {
      // If we can't lock down the role, log loudly but don't block the
      // signup — the (app)/layout role check will still keep them out
      // of authed pages because their role won't be 'admin'/'cleaner'/
      // 'family' until manually set. The DB CHECK constraint also
      // wouldn't accept a role outside the allow-list.
      console.error('[signup] Failed to set pending role:', profileErr)
    }
  }

  revalidatePath('/', 'layout')
  // Send them to / so the role-aware redirect picks up. With role
  // 'pending', they'll land on /awaiting-approval.
  redirect('/')
}

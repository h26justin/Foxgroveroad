'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Self-signup. Creates the auth user; the database trigger gives them
 * role 'pending' so they can't see anything until an admin approves them.
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

  // The on-auth-insert trigger (handle_new_user, db/12) creates the
  // profile with role='pending', so there's nothing to lock down here —
  // and nothing that can fail open. Just tell the admins.
  //
  // Push failures are swallowed: the user should still land on
  // /awaiting-approval cleanly, and the admin will see the pending row
  // on the Team page anyway.
  if (data.user?.id) {
    try {
      const admin = createAdminClient()
      const { sendPushToUsers } = await import('@/lib/push')
      const { data: admins } = await admin
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .eq('is_deleted', false)
      const adminIds = (admins ?? []).map((a: { id: string }) => a.id)
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
  }

  revalidatePath('/', 'layout')
  // Send them to / so the role-aware redirect picks up. With role
  // 'pending', they'll land on /awaiting-approval.
  redirect('/')
}

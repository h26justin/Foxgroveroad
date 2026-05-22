'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, requireProfile } from '@/lib/auth'
import { logAdminAction } from '@/lib/audit'

export async function createAnnouncement(formData: FormData) {
  const profile = await requireAdmin()
  const body = String(formData.get('body') ?? '').trim()

  if (!body) {
    redirect(`/admin/announcements?error=${encodeURIComponent('Message is required')}`)
  }
  if (body.length > 500) {
    redirect(
      `/admin/announcements?error=${encodeURIComponent('Keep it under 500 chars')}`,
    )
  }

  const dismissible = String(formData.get('dismissible') ?? '1') !== '0'

  const supabase = await createClient()

  // Posting a new announcement implicitly retires any previously-active
  // ones — only one banner at a time.
  await supabase
    .from('announcements')
    .update({ is_active: false } as any)
    .eq('is_active', true)

  const { data: inserted, error } = await supabase
    .from('announcements')
    .insert({
      body,
      created_by: profile.id,
      dismissible,
      is_active: true,
    } as any)
    .select('id')
    .single()

  if (error) {
    redirect(`/admin/announcements?error=${encodeURIComponent(error.message)}`)
  }

  await logAdminAction({
    actorId: profile.id,
    action: 'announcement.create',
    targetKind: 'announcement',
    targetId: (inserted as any)?.id ?? null,
    payload: { body, dismissible },
  })

  revalidatePath('/', 'layout')
  revalidatePath('/admin/announcements')
  redirect('/admin/announcements?saved=Posted')
}

export async function deactivateAnnouncement(formData: FormData) {
  const me = await requireAdmin()
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/admin/announcements')

  const supabase = await createClient()
  const { error } = await supabase
    .from('announcements')
    .update({ is_active: false } as any)
    .eq('id', id)

  if (error) {
    redirect(`/admin/announcements?error=${encodeURIComponent(error.message)}`)
  }

  await logAdminAction({
    actorId: me.id,
    action: 'announcement.retire',
    targetKind: 'announcement',
    targetId: id,
  })

  revalidatePath('/', 'layout')
  revalidatePath('/admin/announcements')
  redirect('/admin/announcements?saved=Retired')
}

/**
 * User dismisses the banner. Called from the banner component itself,
 * so this is auth-as-user (not admin). RLS handles the user_id check.
 */
export async function dismissAnnouncement(announcementId: string) {
  const profile = await requireProfile()
  if (!announcementId) return

  const supabase = await createClient()
  await supabase
    .from('announcement_dismissals')
    .insert({
      announcement_id: announcementId,
      user_id: profile.id,
    } as any)

  revalidatePath('/', 'layout')
}

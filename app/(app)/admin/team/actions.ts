'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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

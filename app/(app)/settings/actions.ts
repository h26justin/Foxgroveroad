'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fullName = String(formData.get('full_name') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim() || null

  if (!fullName) {
    redirect(`/settings?error=${encodeURIComponent('Name is required')}`)
  }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, phone })
    .eq('id', user.id)

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect('/settings?saved=1')
}

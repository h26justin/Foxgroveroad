'use server'

import { randomBytes } from 'crypto'
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

/**
 * Set the user's accessibility mode. Values: 'normal' | 'large'.
 *
 * 'large' adds a body class (`fg-acc-large`) that bumps base font sizes
 * across the app. The class is applied by the layout based on the
 * profile's accessibility_mode field.
 */
export async function updateAccessibilityMode(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const mode = String(formData.get('accessibility_mode') ?? '').trim()
  if (mode !== 'normal' && mode !== 'large') {
    redirect(
      `/settings?error=${encodeURIComponent('Invalid display mode')}`,
    )
  }

  const { error } = await supabase
    .from('profiles')
    .update({ accessibility_mode: mode })
    .eq('id', user.id)

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`)
  }

  // Force layout to re-read the profile so the body class flips
  revalidatePath('/', 'layout')
  redirect('/settings?saved=1')
}

/**
 * Rotate the user's calendar feed token. Anyone subscribed to the old
 * URL will silently stop receiving updates; the user copies the new URL
 * from the Settings page and re-subscribes. Useful if a shared URL
 * leaked.
 */
export async function regenerateCalendarToken() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const newToken = randomBytes(32).toString('hex')
  const { error } = await supabase
    .from('profiles')
    .update({ calendar_token: newToken } as any)
    .eq('id', user.id)

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/settings')
  redirect('/settings?saved=1')
}

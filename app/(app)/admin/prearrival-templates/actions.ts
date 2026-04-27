'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

export async function addTemplate(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const roomId = String(formData.get('room_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()

  if (!roomId || !name) {
    redirect(
      '/admin/prearrival-templates?error=' +
        encodeURIComponent('Room and name are required')
    )
  }

  // Pick a position one higher than the current max for that room
  const { data: existing } = await supabase
    .from('prearrival_templates')
    .select('position')
    .eq('room_id', roomId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = ((existing as any)?.position ?? 0) + 1

  const { error } = await supabase.from('prearrival_templates').insert({
    room_id: roomId,
    name,
    position: nextPosition,
  })

  if (error) {
    redirect(
      '/admin/prearrival-templates?error=' + encodeURIComponent(error.message)
    )
  }

  revalidatePath('/admin/prearrival-templates')
  revalidatePath('/bedrooms')
  redirect('/admin/prearrival-templates?saved=1')
}

export async function removeTemplate(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const templateId = String(formData.get('template_id') ?? '')
  if (!templateId) {
    redirect(
      '/admin/prearrival-templates?error=' + encodeURIComponent('Missing id')
    )
  }

  const { error } = await supabase
    .from('prearrival_templates')
    .delete()
    .eq('id', templateId)

  if (error) {
    redirect(
      '/admin/prearrival-templates?error=' + encodeURIComponent(error.message)
    )
  }

  revalidatePath('/admin/prearrival-templates')
  revalidatePath('/bedrooms')
  redirect('/admin/prearrival-templates?saved=1')
}

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'

export async function postMessage(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireProfile()
  const body = String(formData.get('body') ?? '').trim()
  const scopeRaw = String(formData.get('scope') ?? 'general').trim()
  const bookingId = String(formData.get('booking_request_id') ?? '').trim() || null

  if (!body) return { error: 'Type something to post' }
  if (body.length > 2000) return { error: 'Message is too long' }

  const scope = scopeRaw === 'booking' && bookingId ? 'booking' : 'general'

  const supabase = await createClient()
  const { error } = await supabase.from('messages').insert({
    scope,
    booking_request_id: scope === 'booking' ? bookingId : null,
    body,
    author_id: profile.id,
  } as any)
  if (error) return { error: error.message }

  revalidatePath('/chat')
  if (scope === 'booking') revalidatePath('/house')
  return { ok: true }
}

export async function softDeleteMessage(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  await requireProfile()
  if (!id) return { error: 'Missing id' }
  const supabase = await createClient()
  // RLS allows update only if author_id = auth.uid() OR is_admin.
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() } as any)
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/chat')
  revalidatePath('/house')
  return { ok: true }
}

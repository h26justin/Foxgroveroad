'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

const KINDS = [
  'plumber',
  'electrician',
  'locksmith',
  'neighbour',
  'gp',
  'cleaner',
  'gardener',
  'handyman',
  'other',
] as const

export async function createContact(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const me = await requireAdmin()

  const name = String(formData.get('name') ?? '').trim()
  const kind = String(formData.get('kind') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim() || null
  const email = String(formData.get('email') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null
  const isPinned = formData.get('is_pinned') === '1'

  if (!name) return { error: 'Name is required' }
  if (name.length > 200) return { error: 'Name is too long' }
  if (!(KINDS as readonly string[]).includes(kind)) {
    return { error: 'Invalid contact type' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('contacts').insert({
    name,
    kind,
    phone,
    email,
    notes,
    is_pinned: isPinned,
    created_by: me.id,
  } as any)
  if (error) return { error: error.message }

  revalidatePath('/contacts')
  return { ok: true }
}

export async function updateContact(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { error: 'Missing id' }

  const name = String(formData.get('name') ?? '').trim()
  const kind = String(formData.get('kind') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim() || null
  const email = String(formData.get('email') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null
  const isPinned = formData.get('is_pinned') === '1'

  if (!name) return { error: 'Name is required' }
  if (!(KINDS as readonly string[]).includes(kind)) {
    return { error: 'Invalid contact type' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('contacts')
    .update({
      name,
      kind,
      phone,
      email,
      notes,
      is_pinned: isPinned,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/contacts')
  return { ok: true }
}

export async function deleteContact(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  if (!id) return { error: 'Missing id' }
  const supabase = await createClient()
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/contacts')
  return { ok: true }
}

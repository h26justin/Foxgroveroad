'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

export async function createPage(
  formData: FormData,
): Promise<{ ok?: true; slug?: string; error?: string }> {
  const me = await requireAdmin()
  const title = String(formData.get('title') ?? '').trim()
  const body = String(formData.get('body') ?? '')
  const isPinned = formData.get('is_pinned') === '1'

  if (!title) return { error: 'Title is required' }
  if (title.length > 200) return { error: 'Title is too long' }

  const slug = slugify(title)
  if (!slug) return { error: 'Title must contain letters or numbers' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('wiki_pages')
    .insert({
      slug,
      title,
      body,
      is_pinned: isPinned,
      created_by: me.id,
      updated_by: me.id,
    } as any)
    .select('slug')
    .single()

  if (error) {
    if ((error.message ?? '').toLowerCase().includes('duplicate')) {
      return { error: 'A page with that title already exists' }
    }
    return { error: error.message }
  }

  revalidatePath('/wiki')
  return { ok: true, slug: (data as any).slug }
}

export async function updatePage(
  formData: FormData,
): Promise<{ ok?: true; slug?: string; error?: string }> {
  const me = await requireAdmin()
  const id = String(formData.get('id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const body = String(formData.get('body') ?? '')
  const isPinned = formData.get('is_pinned') === '1'

  if (!id) return { error: 'Missing id' }
  if (!title) return { error: 'Title is required' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('wiki_pages')
    .update({
      title,
      body,
      is_pinned: isPinned,
      updated_by: me.id,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', id)
    .select('slug')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/wiki')
  revalidatePath(`/wiki/${(data as any).slug}`)
  return { ok: true, slug: (data as any).slug }
}

export async function deletePage(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin()
  if (!id) return { error: 'Missing id' }
  const supabase = await createClient()
  const { error } = await supabase.from('wiki_pages').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/wiki')
  redirect('/wiki')
}

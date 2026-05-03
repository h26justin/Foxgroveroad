'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { FEATURES } from '@/lib/feature-flags'

/**
 * Set a feature flag on or off. Idempotent — uses upsert keyed on
 * `name` so toggling repeatedly just updates the same row.
 *
 * Side effect: revalidates the entire layout so the TopNav reflects
 * the change immediately. Without `'/', 'layout'`, the user has to
 * full-page-refresh to see the nav update.
 */
export async function setFeatureFlag(formData: FormData) {
  const me = await requireAdmin()
  const name = String(formData.get('name') ?? '').trim()
  const enabled = String(formData.get('enabled') ?? '') === 'true'

  // Whitelist: only allow toggling of known features.
  if (!FEATURES.some((f) => f.name === name)) {
    redirect(`/admin/features?error=${encodeURIComponent('Unknown feature')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('feature_flags')
    .upsert(
      {
        name,
        enabled,
        updated_at: new Date().toISOString(),
        updated_by: me.id,
      },
      { onConflict: 'name' },
    )

  if (error) {
    redirect(
      `/admin/features?error=${encodeURIComponent(error.message)}`,
    )
  }

  // Revalidate the layout (which contains TopNav) so nav items
  // appear/disappear right away.
  revalidatePath('/', 'layout')
  revalidatePath('/admin/features')
  redirect('/admin/features?saved=1')
}

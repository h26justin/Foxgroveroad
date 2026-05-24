import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type UserFeaturePrefs = {
  show_expenses: boolean
  show_contacts: boolean
  show_chat: boolean
  show_wiki: boolean
  email_notifications: boolean
}

export const DEFAULT_USER_PREFS: UserFeaturePrefs = {
  show_expenses: true,
  show_contacts: true,
  show_chat: true,
  show_wiki: true,
  email_notifications: false, // opt-in
}

/**
 * Fetch the current user's feature preferences. Returns defaults if the
 * user has never opened the settings page (no row in user_feature_prefs).
 *
 * Wrapped in React's cache() so the (app) layout + nav + page calls
 * share one DB roundtrip per request.
 */
export const getUserPrefs = cache(async (userId: string): Promise<UserFeaturePrefs> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('user_feature_prefs')
    .select('show_expenses, show_contacts, show_chat, show_wiki, email_notifications')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return DEFAULT_USER_PREFS
  // Spread defaults so any future-added columns don't break old rows.
  return { ...DEFAULT_USER_PREFS, ...(data as any) }
})

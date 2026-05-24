import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getUserPrefs } from '@/lib/user-prefs'
import { redirect } from 'next/navigation'
import ContactsClient from './ContactsClient'

export const revalidate = 30

const KIND_LABEL: Record<string, string> = {
  plumber: 'Plumber',
  electrician: 'Electrician',
  locksmith: 'Locksmith',
  neighbour: 'Neighbour',
  gp: 'GP / Doctor',
  cleaner: 'Cleaner',
  gardener: 'Gardener',
  handyman: 'Handyman',
  other: 'Other',
}

export default async function ContactsPage() {
  const [profile, supabase] = await Promise.all([
    requireProfile(),
    createClient(),
  ])

  // Respect the user's pref — silently bounce to dashboard if they
  // turned this off (so an external link can't surface the tab).
  const prefs = await getUserPrefs(profile.id)
  if (!prefs.show_contacts) redirect('/dashboard')

  const { data: rows } = await supabase
    .from('contacts')
    .select('id, name, kind, phone, email, notes, is_pinned')
    .order('is_pinned', { ascending: false })
    .order('kind')
    .order('name')

  const contacts = ((rows as any[]) ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    kind: c.kind as string,
    phone: (c.phone as string | null) ?? null,
    email: (c.email as string | null) ?? null,
    notes: (c.notes as string | null) ?? null,
    is_pinned: !!c.is_pinned,
  }))

  return (
    <ContactsClient
      contacts={contacts}
      isAdmin={profile.role === 'admin'}
      kindLabels={KIND_LABEL}
    />
  )
}

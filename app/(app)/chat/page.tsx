import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getUserPrefs } from '@/lib/user-prefs'
import { redirect } from 'next/navigation'
import ChatClient from './ChatClient'

// 15s cache — short so new messages from other people appear quickly,
// long enough that revisiting the tab doesn't always hit the server.
export const revalidate = 15

export default async function ChatPage() {
  const [profile, supabase] = await Promise.all([
    requireProfile(),
    createClient(),
  ])

  const prefs = await getUserPrefs(profile.id)
  if (!prefs.show_chat) redirect('/dashboard')

  const { data: rows } = await supabase
    .from('messages')
    .select(
      'id, body, author_id, created_at, deleted_at, author:profiles!messages_author_id_fkey(full_name, role)',
    )
    .eq('scope', 'general')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  const messages = ((rows as any[]) ?? []).map((m) => ({
    id: m.id as string,
    body: m.body as string,
    author_id: m.author_id as string,
    author_name: (m.author as any)?.full_name ?? 'Someone',
    author_role: (m.author as any)?.role ?? 'family',
    created_at: m.created_at as string,
  }))

  return (
    <ChatClient
      messages={messages}
      currentUserId={profile.id}
      isAdmin={profile.role === 'admin'}
    />
  )
}

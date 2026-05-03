import Link from 'next/link'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { listAttachmentsForEntities } from '@/lib/attachments'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { redirect } from 'next/navigation'
import IssuesClient from './IssuesClient'

// Soft cache. Mutations call revalidatePath('/issues') so admin's own
// actions show up immediately. The 30s ceiling means a cleaner's report
// from another device may take up to 30s to appear here.
export const revalidate = 30

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; saved?: string; error?: string }>
}) {
  const [profile, sp, supabase] = await Promise.all([
    requireProfile(),
    searchParams,
    createClient(),
  ])

  if (!(await isFeatureEnabled('issues'))) redirect('/housekeeping')
  if (profile.role !== 'admin' && profile.role !== 'cleaner') {
    redirect('/house')
  }

  const filter = sp.filter === 'resolved' ? 'resolved' : 'open'

  // Single query with joined room + creator + resolver names
  const { data: rowsRaw } = await supabase
    .from('issues')
    .select(`
      id, created_at, description, status,
      resolved_at, resolution_note,
      room_id, rooms:rooms!issues_room_id_fkey(id, name, floor),
      created_by, creator:profiles!issues_created_by_fkey(full_name),
      resolved_by, resolver:profiles!issues_resolved_by_fkey(full_name)
    `)
    .eq('status', filter)
    .order('created_at', { ascending: false })

  const rows = (rowsRaw as any[]) ?? []

  // Bulk-fetch photos for all visible issues in one trip.
  const issueIds = rows.map((r) => r.id)
  const photosMap = await listAttachmentsForEntities('issue', issueIds)

  // Attach photos to each issue
  const issues = rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    description: r.description,
    status: r.status,
    resolved_at: r.resolved_at,
    resolution_note: r.resolution_note,
    room_id: r.room_id,
    room_name: r.rooms?.name ?? '(deleted room)',
    room_floor: r.rooms?.floor ?? null,
    created_by: r.created_by,
    creator_name: r.creator?.full_name ?? 'Unknown',
    resolved_by: r.resolved_by,
    resolver_name: r.resolver?.full_name ?? null,
    photos: photosMap.get(r.id) ?? [],
  }))

  // Counts for the filter toggle, plus rooms for the "+ Report issue" picker
  const [openCountRes, resolvedCountRes, roomsRes] = await Promise.all([
    supabase
      .from('issues')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
    supabase
      .from('issues')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'resolved'),
    supabase
      .from('rooms')
      .select('id, name, floor')
      .order('floor', { ascending: false })
      .order('name'),
  ])

  return (
    <IssuesClient
      profile={profile}
      issues={issues}
      filter={filter}
      openCount={openCountRes.count ?? 0}
      resolvedCount={resolvedCountRes.count ?? 0}
      rooms={(roomsRes.data as any[]) ?? []}
      savedMessage={sp.saved ?? null}
      errorMessage={sp.error ?? null}
    />
  )
}

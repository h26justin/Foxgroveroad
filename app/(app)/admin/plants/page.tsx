import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayISO } from '@/lib/dates'
import { annotatePlants, type Plant, type PlantWatering } from '@/lib/plants'
import PlantsAdminClient from './PlantsAdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminPlantsPage() {
  const profile = await requireProfile()
  if (profile.role !== 'admin') {
    redirect('/dashboard')
  }
  const supabase = await createClient()
  const today = todayISO()

  const [plantsRes, wateringsRes] = await Promise.all([
    supabase
      .from('plants')
      .select('id, name, location, frequency_days, notes, position')
      .order('position'),
    supabase
      .from('plant_waterings')
      .select('id, plant_id, watered_by, watered_at, watered_at_date')
      .order('watered_at', { ascending: false })
      .limit(200),
  ])

  const plants = ((plantsRes.data as any[]) ?? []) as Plant[]
  const waterings = ((wateringsRes.data as any[]) ?? []) as PlantWatering[]
  const annotated = annotatePlants(plants, waterings, today)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/dashboard"
          className="fg-btn-ghost"
          style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
        >
          ← Dashboard
        </Link>
      </div>
      <h1
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 28,
          color: 'var(--color-ink)',
          marginBottom: 8,
        }}
      >
        Plants
      </h1>
      <p
        className="fg-mono"
        style={{
          color: 'var(--color-muted)',
          fontSize: 12,
          marginBottom: 24,
        }}
      >
        {plants.length} plant{plants.length === 1 ? '' : 's'}. Cleaners see this
        list under the House (global) room on the housekeeping page.
      </p>
      <PlantsAdminClient initialPlants={annotated} />
    </div>
  )
}

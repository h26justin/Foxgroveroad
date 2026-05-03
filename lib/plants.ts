/**
 * Plants (v34) — types + status derivation.
 *
 * Each plant has its own watering frequency (in days). A plant's
 * status is derived from the most recent `plant_waterings` row:
 *
 *   ok        — watered recently, well within frequency window
 *   due       — exactly at the frequency boundary (water it today)
 *   overdue   — past the boundary, or never watered
 */

export type PlantStatus = 'ok' | 'due' | 'overdue'

export type Plant = {
  id: string
  name: string
  location: string | null
  frequency_days: number
  notes: string | null
  position: number
}

export type PlantWatering = {
  id: string
  plant_id: string
  watered_by: string | null
  watered_at: string
  watered_at_date: string
}

export type PlantWithStatus = Plant & {
  lastWatered: string | null // ISO date 'YYYY-MM-DD' or null
  daysSinceWatered: number | null // null if never watered
  status: PlantStatus
  reason: string
  /** The watering id of the most recent watering, used to support Undo. */
  lastWateringId: string | null
  /** Whether the most recent watering happened today. */
  wateredToday: boolean
}

export const PLANT_STATUS_LABEL: Record<PlantStatus, string> = {
  ok: 'OK',
  due: 'Due',
  overdue: 'Overdue',
}

/**
 * Compute the latest watering for each plant + derived status.
 * `today` should be the ISO date the caller wants to compute status as of.
 */
export function annotatePlants(
  plants: Plant[],
  waterings: PlantWatering[],
  today: string,
): PlantWithStatus[] {
  // Index latest watering per plant
  const latestByPlant = new Map<string, PlantWatering>()
  for (const w of waterings) {
    const existing = latestByPlant.get(w.plant_id)
    if (!existing || w.watered_at > existing.watered_at) {
      latestByPlant.set(w.plant_id, w)
    }
  }

  return plants
    .slice()
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map((p) => {
      const latest = latestByPlant.get(p.id)
      const lastWatered = latest?.watered_at_date ?? null
      const daysSince = lastWatered ? daysBetween(lastWatered, today) : null
      const wateredToday = lastWatered === today

      let status: PlantStatus
      let reason: string

      if (daysSince === null) {
        status = 'overdue'
        reason = 'Never watered'
      } else if (daysSince <= 0) {
        status = 'ok'
        reason = 'Watered today'
      } else if (daysSince < p.frequency_days) {
        status = 'ok'
        reason = `Watered ${daysSince}d ago`
      } else if (daysSince === p.frequency_days) {
        status = 'due'
        reason = 'Due today'
      } else {
        status = 'overdue'
        const overdueBy = daysSince - p.frequency_days
        reason = `Overdue ${overdueBy}d`
      }

      return {
        ...p,
        lastWatered,
        daysSinceWatered: daysSince,
        status,
        reason,
        lastWateringId: latest?.id ?? null,
        wateredToday,
      }
    })
}

/** Days from ISO `from` to ISO `to`. Negative if `to` is before `from`. */
function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00')
  const b = new Date(to + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PlantWithStatus } from '@/lib/plants'
import { recordPlantWatering, undoPlantWatering } from './actions'

/**
 * Plants checklist — appears inside the House (global) room body on the
 * housekeeping page. Each plant is its own tickable row. Cleaners and
 * admins can record a watering; partial progress is preserved through
 * the week (the row goes green once watered, but stays visible).
 */
export default function PlantsSection({
  initialPlants,
  canWater,
  currentUserId,
  isAdmin,
}: {
  initialPlants: PlantWithStatus[]
  canWater: boolean
  currentUserId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const [plants, setPlants] = useState<PlantWithStatus[]>(initialPlants)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [, startTransition] = useTransition()

  const dueCount = plants.filter(
    (p) => p.status === 'due' || p.status === 'overdue',
  ).length
  const okCount = plants.length - dueCount

  if (plants.length === 0) {
    // No plants yet → don't render at all (admin can add via /admin/plants)
    return null
  }

  async function handleWater(plant: PlantWithStatus) {
    setError(null)
    setBusy(plant.id)
    // Optimistic
    const prev = plants
    setPlants((cur) =>
      cur.map((p) =>
        p.id === plant.id
          ? {
              ...p,
              status: 'ok',
              reason: 'Watered today',
              wateredToday: true,
              lastWatered: new Date().toISOString().slice(0, 10),
              daysSinceWatered: 0,
              lastWateringId: 'optimistic-' + plant.id,
            }
          : p,
      ),
    )
    const result = await recordPlantWatering(plant.id)
    if (result.error) {
      setPlants(prev)
      setError(result.error)
      setBusy(null)
      return
    }
    // Replace optimistic id with real one
    setPlants((cur) =>
      cur.map((p) =>
        p.id === plant.id
          ? { ...p, lastWateringId: result.wateringId ?? null }
          : p,
      ),
    )
    setBusy(null)
    startTransition(() => router.refresh())
  }

  async function handleUndo(plant: PlantWithStatus) {
    if (!plant.lastWateringId) return
    // No confirm — clicking Undo on a plant the user JUST watered is
    // already explicit enough. Optimistic UI + the action being
    // reversible (just water again) keeps this safe.
    setError(null)
    setBusy(plant.id)
    const prev = plants
    // Optimistic: roll the row back to "Never watered" for now; the
    // refresh below will pull the true previous state.
    setPlants((cur) =>
      cur.map((p) =>
        p.id === plant.id
          ? {
              ...p,
              status: 'overdue',
              reason: 'Updating…',
              wateredToday: false,
              lastWateringId: null,
            }
          : p,
      ),
    )
    const result = await undoPlantWatering(plant.lastWateringId)
    if (result.error) {
      setPlants(prev)
      setError(result.error)
      setBusy(null)
      return
    }
    setBusy(null)
    startTransition(() => router.refresh())
  }

  return (
    <div className="fg-completed-section" style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="fg-completed-header"
        aria-expanded={expanded}
        style={{
          background: 'transparent',
          width: '100%',
          textAlign: 'left',
        }}
      >
        <span
          className={`fg-room-chevron${expanded ? ' is-open' : ''}`}
          aria-hidden
        >
          ▸
        </span>
        <span style={{ flex: 1 }}>🪴 Plants</span>
        {dueCount > 0 && (
          <span
            className="fg-pill text-xs"
            style={{
              background: 'var(--color-amber, #A8862E)',
              color: 'white',
              marginRight: 8,
            }}
          >
            {dueCount} need water
          </span>
        )}
        <span className="fg-completed-count">
          {okCount}/{plants.length}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          {error && (
            <div className="fg-msg-error" style={{ fontSize: 12 }}>
              {error}
            </div>
          )}
          {plants.map((p) => (
            <PlantRow
              key={p.id}
              plant={p}
              canWater={canWater}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              isBusy={busy === p.id}
              onWater={() => handleWater(p)}
              onUndo={() => handleUndo(p)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PlantRow({
  plant,
  canWater,
  isAdmin,
  currentUserId,
  isBusy,
  onWater,
  onUndo,
}: {
  plant: PlantWithStatus
  canWater: boolean
  isAdmin: boolean
  currentUserId: string
  isBusy: boolean
  onWater: () => void
  onUndo: () => void
}) {
  const color =
    plant.status === 'ok'
      ? 'var(--color-green, #2f7a4f)'
      : plant.status === 'due'
        ? 'var(--color-amber, #A8862E)'
        : 'var(--color-red, #b04030)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '8px 10px',
        background: 'var(--color-cream, #F4F3EF)',
        border: '1px solid var(--color-warm)',
        borderRadius: 6,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: color,
          marginTop: 5,
          flexShrink: 0,
        }}
        aria-hidden
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 14,
            color: 'var(--color-ink)',
          }}
        >
          {plant.name}
        </div>
        <div
          className="fg-mono"
          style={{ fontSize: 11, color: 'var(--color-muted)' }}
        >
          {plant.location && <>{plant.location} · </>}
          <span style={{ color }}>{plant.reason}</span>
          <> · every {plant.frequency_days}d</>
        </div>
        {plant.notes && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-ink)',
              marginTop: 2,
              fontStyle: 'italic',
            }}
          >
            {plant.notes}
          </div>
        )}
      </div>
      {canWater && plant.wateredToday && plant.lastWateringId ? (
        <button
          type="button"
          onClick={onUndo}
          disabled={isBusy}
          className="fg-btn-ghost"
          style={{
            width: 'auto',
            padding: '4px 10px',
            fontSize: 11,
            color: 'var(--color-muted)',
            flexShrink: 0,
          }}
          title="Undo today's watering"
        >
          ✓ Undo
        </button>
      ) : canWater ? (
        <button
          type="button"
          onClick={onWater}
          disabled={isBusy}
          className="fg-btn-gold"
          style={{
            width: 'auto',
            padding: '4px 12px',
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          💧 Water
        </button>
      ) : null}
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PlantWithStatus } from '@/lib/plants'
import { createPlant, updatePlant, deletePlant } from '../../plants/actions'

export default function PlantsAdminClient({
  initialPlants,
}: {
  initialPlants: PlantWithStatus[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(initialPlants.length === 0)

  return (
    <>
      {/* Add new */}
      <div style={{ marginBottom: 24 }}>
        {showAdd ? (
          <PlantForm
            mode="create"
            onSaved={() => {
              setShowAdd(false)
              startTransition(() => router.refresh())
            }}
            onCancel={() => setShowAdd(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="fg-btn-gold"
            style={{ width: 'auto', padding: '8px 16px' }}
          >
            + Add plant
          </button>
        )}
      </div>

      {/* Table */}
      {initialPlants.length === 0 ? (
        <p
          className="fg-mono"
          style={{ color: 'var(--color-muted)', fontSize: 13 }}
        >
          No plants yet. Add one above.
        </p>
      ) : (
        <div className="space-y-2">
          {initialPlants.map((p) =>
            editingId === p.id ? (
              <PlantForm
                key={p.id}
                mode="edit"
                plant={p}
                onSaved={() => {
                  setEditingId(null)
                  startTransition(() => router.refresh())
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <PlantRowAdmin
                key={p.id}
                plant={p}
                onEdit={() => setEditingId(p.id)}
                onDelete={async () => {
                  if (
                    !window.confirm(
                      `Delete "${p.name}"? Watering history will also be removed.`,
                    )
                  )
                    return
                  const r = await deletePlant(p.id)
                  if (r.error) alert(r.error)
                  else startTransition(() => router.refresh())
                }}
              />
            ),
          )}
        </div>
      )}
    </>
  )
}

function PlantRowAdmin({
  plant,
  onEdit,
  onDelete,
}: {
  plant: PlantWithStatus
  onEdit: () => void
  onDelete: () => void
}) {
  const color =
    plant.status === 'ok'
      ? 'var(--color-green, #2f7a4f)'
      : plant.status === 'due'
        ? 'var(--color-amber, #A8862E)'
        : 'var(--color-red, #b04030)'

  return (
    <div
      className="fg-card"
      style={{
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: color,
          marginTop: 6,
          flexShrink: 0,
        }}
        aria-hidden
        title={plant.reason}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 16,
            color: 'var(--color-ink)',
          }}
        >
          {plant.name}
        </div>
        <div
          className="fg-mono"
          style={{
            fontSize: 11,
            color: 'var(--color-muted)',
            marginTop: 2,
          }}
        >
          {plant.location && <>{plant.location} · </>}
          every {plant.frequency_days}d
          {' · '}
          <span style={{ color }}>{plant.reason}</span>
        </div>
        {plant.notes && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-ink)',
              marginTop: 4,
              whiteSpace: 'pre-wrap',
            }}
          >
            {plant.notes}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onEdit}
          className="fg-btn-ghost"
          style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="fg-btn-ghost"
          style={{
            width: 'auto',
            padding: '4px 10px',
            fontSize: 12,
            color: 'var(--color-red, #b04030)',
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function PlantForm({
  mode,
  plant,
  onSaved,
  onCancel,
}: {
  mode: 'create' | 'edit'
  plant?: PlantWithStatus
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(plant?.name ?? '')
  const [location, setLocation] = useState(plant?.location ?? '')
  const [frequency, setFrequency] = useState(
    String(plant?.frequency_days ?? 7),
  )
  const [notes, setNotes] = useState(plant?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    setBusy(true)
    const fd = new FormData()
    if (plant) fd.append('id', plant.id)
    fd.append('name', name)
    fd.append('location', location)
    fd.append('frequency_days', frequency)
    fd.append('notes', notes)
    const result =
      mode === 'create' ? await createPlant(fd) : await updatePlant(fd)
    if (result.error) {
      setError(result.error)
      setBusy(false)
      return
    }
    setBusy(false)
    onSaved()
  }

  return (
    <div
      className="fg-card"
      style={{
        padding: 16,
        background: 'var(--color-cream, #F4F3EF)',
      }}
    >
      <h3
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 18,
          color: 'var(--color-ink)',
          marginBottom: 12,
        }}
      >
        {mode === 'create' ? 'Add a plant' : `Edit ${plant?.name ?? 'plant'}`}
      </h3>

      <label
        className="fg-mono"
        style={{ fontSize: 11, color: 'var(--color-muted)' }}
      >
        Plant name
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="fg-input"
        maxLength={200}
        placeholder="e.g. Kitchen herb planter"
        style={{ width: '100%', marginBottom: 10 }}
        disabled={busy}
      />

      <label
        className="fg-mono"
        style={{ fontSize: 11, color: 'var(--color-muted)' }}
      >
        Location (optional)
      </label>
      <input
        type="text"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        className="fg-input"
        placeholder="e.g. Kitchen window"
        style={{ width: '100%', marginBottom: 10 }}
        disabled={busy}
      />

      <label
        className="fg-mono"
        style={{ fontSize: 11, color: 'var(--color-muted)' }}
      >
        Watering frequency (days)
      </label>
      <input
        type="number"
        value={frequency}
        onChange={(e) => setFrequency(e.target.value)}
        className="fg-input"
        min={1}
        max={365}
        style={{ width: 120, marginBottom: 10 }}
        disabled={busy}
      />

      <label
        className="fg-mono"
        style={{ fontSize: 11, color: 'var(--color-muted)' }}
      >
        Notes (optional)
      </label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="fg-input"
        rows={2}
        placeholder="e.g. Drought-tolerant, doesn't like full sun"
        style={{ width: '100%', marginBottom: 12 }}
        disabled={busy}
      />

      {error && (
        <div
          className="fg-msg-error"
          style={{ fontSize: 12, marginBottom: 10 }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !name.trim()}
          className="fg-btn-gold"
          style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }}
        >
          {busy ? 'Saving…' : mode === 'create' ? 'Add plant' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="fg-btn-ghost"
          style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

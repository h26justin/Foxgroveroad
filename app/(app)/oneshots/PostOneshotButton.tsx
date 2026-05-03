'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createOneshotTask } from './actions'
import { uploadAttachment } from '../attachments/actions'
import { floorLabel } from '@/lib/floors'

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.85

/**
 * Admin-only "+ Post one-shot task" button. Opens a modal where admin
 * types a description, optionally picks a room, marks priority, and
 * optionally attaches a photo.
 *
 * Photo upload happens in two phases (same pattern as issue reporting):
 *   1. createOneshotTask returns task id
 *   2. uploadAttachment(kind='oneshot_task', entity_id=task_id) if photo
 *
 * Photo upload failures are non-fatal — the task still exists.
 */
export default function PostOneshotButton({
  rooms,
}: {
  rooms: { id: string; name: string; floor: number }[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [roomId, setRoomId] = useState('')
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function close() {
    if (busy) return
    setOpen(false)
    setDescription('')
    setRoomId('')
    setPriority('normal')
    setPhotoFile(null)
    setError(null)
  }

  function handlePhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please pick an image file')
      return
    }
    setPhotoFile(file)
  }

  // Compress to a sane size before upload — big iPhone photos are 4-5MB
  // and we don't need that resolution.
  async function compressImage(file: File): Promise<Blob> {
    const img = new Image()
    const url = URL.createObjectURL(file)
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Could not load image'))
        img.src = url
      })
      const scale = Math.min(
        1,
        MAX_DIMENSION / img.width,
        MAX_DIMENSION / img.height,
      )
      const targetW = Math.round(img.width * scale)
      const targetH = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not get canvas context')
      ctx.drawImage(img, 0, 0, targetW, targetH)
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(new Error('Canvas blob failed')),
          'image/jpeg',
          JPEG_QUALITY,
        )
      })
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  async function handleSubmit() {
    setError(null)
    const trimmed = description.trim()
    if (!trimmed) {
      setError('Please describe the task')
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('description', trimmed)
      if (roomId) fd.append('room_id', roomId)
      fd.append('priority', priority)
      const result = await createOneshotTask(fd)
      if (result.error || !result.task_id) {
        setError(result.error ?? 'Failed to create')
        setBusy(false)
        return
      }
      const taskId = result.task_id

      // Optional photo
      if (photoFile) {
        try {
          const compressed = await compressImage(photoFile)
          const photoFd = new FormData()
          photoFd.append('kind', 'oneshot_task')
          photoFd.append('entity_id', taskId)
          photoFd.append(
            'file',
            new File([compressed], photoFile.name.replace(/\.[^.]+$/, '.jpg'), {
              type: 'image/jpeg',
            }),
          )
          await uploadAttachment(photoFd)
        } catch {
          // Don't fail the whole flow; task is already created
        }
      }

      setBusy(false)
      setOpen(false)
      setDescription('')
      setRoomId('')
      setPriority('normal')
      setPhotoFile(null)
      startTransition(() => router.refresh())
    } catch (e: any) {
      setBusy(false)
      setError(e?.message ?? 'Something went wrong')
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fg-btn-gold text-xs"
        style={{ width: 'auto', padding: '8px 14px' }}
      >
        + Post task
      </button>
    )
  }

  return (
    <>
      <div className="fg-panel-backdrop" onClick={close} aria-hidden />
      <div className="fg-modal" role="dialog">
        <div className="fg-modal-header">
          <h3
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '18px',
              color: 'var(--color-ink)',
            }}
          >
            Post a task
          </h3>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="fg-panel-close"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="fg-modal-body">
          {error && <div className="fg-msg-error mb-3">{error}</div>}

          <p
            className="text-xs fg-mono mb-4"
            style={{ color: 'var(--color-muted)' }}
          >
            For ad-hoc tasks outside the regular cleaning rota.
            Cleaners will see this on the housekeeping page.
          </p>

          <div className="mb-3">
            <label className="fg-label">What needs doing?</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              autoFocus
              className="fg-input"
              placeholder="e.g. Clean garden table — algae build-up"
              maxLength={2000}
              disabled={busy}
            />
          </div>

          <div className="mb-3">
            <label className="fg-label">Room (optional)</label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="fg-input"
              disabled={busy}
            >
              <option value="">— no specific room —</option>
              {(() => {
                // Group rooms by floor, then render optgroups in
                // top-to-bottom order matching the rest of the app:
                // Attic (2) → First (1) → Ground (0) → Garden (-1) → House (-2)
                const byFloor = new Map<number, typeof rooms>()
                for (const r of rooms) {
                  const arr = byFloor.get(r.floor) ?? []
                  arr.push(r)
                  byFloor.set(r.floor, arr)
                }
                const floors = Array.from(byFloor.keys()).sort((a, b) => b - a)
                return floors.map((floor) => {
                  const inFloor = (byFloor.get(floor) ?? [])
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                  return (
                    <optgroup key={floor} label={floorLabel(floor)}>
                      {inFloor.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </optgroup>
                  )
                })
              })()}
            </select>
          </div>

          <div className="mb-3">
            <label className="fg-label">Priority</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPriority('normal')}
                className={
                  priority === 'normal' ? 'fg-btn-gold' : 'fg-btn-ghost'
                }
                style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                disabled={busy}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setPriority('urgent')}
                className={
                  priority === 'urgent' ? 'fg-btn-gold' : 'fg-btn-ghost'
                }
                style={{
                  width: 'auto',
                  padding: '6px 12px',
                  fontSize: 12,
                  ...(priority === 'urgent'
                    ? { background: 'var(--color-red)', color: 'white' }
                    : {}),
                }}
                disabled={busy}
              >
                ⚠ Urgent
              </button>
            </div>
          </div>

          <div className="mb-3">
            <label className="fg-label">Photo (optional)</label>
            {photoFile ? (
              <div
                className="text-xs fg-mono flex items-center gap-2"
                style={{ color: 'var(--color-muted)' }}
              >
                <span>📷 {photoFile.name}</span>
                <button
                  type="button"
                  onClick={() => setPhotoFile(null)}
                  disabled={busy}
                  className="fg-mono"
                  style={{
                    color: 'var(--color-red)',
                    textDecoration: 'underline',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="fg-btn-ghost text-xs"
                style={{ width: 'auto', padding: '6px 12px' }}
              >
                📷 Add photo
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChosen}
              style={{ display: 'none' }}
            />
          </div>
        </div>
        <div className="fg-modal-footer">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="fg-btn-ghost"
            style={{ width: 'auto', padding: '8px 14px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !description.trim()}
            className="fg-btn-gold"
            style={{ width: 'auto', padding: '8px 18px' }}
          >
            {busy ? 'Posting…' : 'Post task'}
          </button>
        </div>
      </div>
    </>
  )
}

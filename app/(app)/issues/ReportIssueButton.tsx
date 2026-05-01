'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createIssue } from './actions'
import { uploadAttachment } from '../attachments/actions'

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.85

/**
 * Tappable "Report issue" button that opens a small inline form. The
 * cleaner types a description, optionally takes a photo, and submits.
 *
 * Photo upload happens in two phases:
 *   1. createIssue() returns the new issue's id
 *   2. if a photo is selected, we then call uploadAttachment() with
 *      kind='issue' and entity_id=that-new-id
 *
 * If the photo upload fails after the issue is created, the issue still
 * exists — the cleaner just sees an error and can re-attach later.
 */
export default function ReportIssueButton({
  roomId,
  roomName,
  buttonClassName = 'text-xs fg-mono',
  buttonStyle,
}: {
  roomId: string
  roomName: string
  buttonClassName?: string
  buttonStyle?: React.CSSProperties
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function close() {
    if (busy) return
    setOpen(false)
    setDescription('')
    setPhotoFile(null)
    setError(null)
  }

  async function handlePhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please pick an image file')
      return
    }
    setPhotoFile(file)
  }

  async function handleSubmit() {
    setError(null)
    const trimmed = description.trim()
    if (!trimmed) {
      setError('Please describe the issue')
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('description', trimmed)
      fd.append('room_id', roomId)
      const result = await createIssue(fd)
      if (result.error) {
        setError(result.error)
        setBusy(false)
        return
      }
      const issueId = result.issue_id!

      // Phase 2: upload the photo if one was selected
      if (photoFile) {
        try {
          const downscaled = await downscaleImage(photoFile)
          const photoFd = new FormData()
          photoFd.append('file', downscaled, downscaled.name)
          photoFd.append('kind', 'issue')
          photoFd.append('entity_id', issueId)
          const uploadResult = await uploadAttachment(photoFd)
          if (uploadResult.error) {
            // Issue still got created — surface the photo error but
            // don't pretend the whole thing failed.
            setError(
              'Issue saved, but the photo failed to upload: ' +
                uploadResult.error
            )
            setBusy(false)
            return
          }
        } catch (err: any) {
          setError(
            'Issue saved, but the photo failed: ' +
              (err?.message ?? 'unknown error')
          )
          setBusy(false)
          return
        }
      }

      // Success — close and refresh
      setOpen(false)
      setDescription('')
      setPhotoFile(null)
      setBusy(false)
      startTransition(() => router.refresh())
    } catch (err: any) {
      setError(err?.message ?? 'Failed to report issue')
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName}
        style={{
          color: 'var(--color-amber)',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
          ...buttonStyle,
        }}
      >
        ⚠ Report issue
      </button>
    )
  }

  return (
    <>
      <div className="fg-panel-backdrop" onClick={close} aria-hidden />
      <div className="fg-modal" role="dialog">
        <div className="fg-modal-header">
          <div className="flex-1">
            <h3
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '18px',
                color: 'var(--color-ink)',
              }}
            >
              Report issue
            </h3>
            <div
              className="text-xs fg-mono"
              style={{ color: 'var(--color-muted)' }}
            >
              {roomName}
            </div>
          </div>
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

          <label className="fg-label">What's wrong?</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            autoFocus
            className="fg-input"
            placeholder="e.g. Toilet running, won't stop"
            maxLength={2000}
            disabled={busy}
          />

          <div className="mt-3">
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
              capture="environment"
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
            disabled={busy}
            className="fg-btn-gold"
            style={{ width: 'auto', padding: '8px 18px' }}
          >
            {busy ? 'Reporting…' : 'Report'}
          </button>
        </div>
      </div>
    </>
  )
}

// Image downscale (same logic as PhotoUpload — duplicated rather than
// shared because it's small and keeps each component self-contained)
async function downscaleImage(file: File): Promise<File> {
  const dataUrl = await readAsDataURL(file)
  const img = await loadImage(dataUrl)

  const longEdge = Math.max(img.width, img.height)
  const scale = longEdge > MAX_DIMENSION ? MAX_DIMENSION / longEdge : 1
  const targetW = Math.round(img.width * scale)
  const targetH = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')

  ctx.drawImage(img, 0, 0, targetW, targetH)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  )
  if (!blob) throw new Error('Failed to encode image')

  const baseName = file.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { uploadAttachment } from './actions'
import type { AttachmentKind } from '@/lib/attachments'

const MAX_DIMENSION = 1600 // px — long edge after downscale
const JPEG_QUALITY = 0.85

/**
 * Reusable photo-upload button. Opens the camera on mobile (via the
 * `capture` attribute), downscales on the client to keep storage tidy
 * and rotation consistent, then submits to the server action.
 *
 * Usage:
 *   <PhotoUpload kind="issue" entityId={issue.id} onUploaded={refresh} />
 */
export default function PhotoUpload({
  kind,
  entityId,
  buttonLabel = '📷 Add photo',
  className = 'fg-btn-ghost text-xs',
  onUploaded,
}: {
  kind: AttachmentKind
  entityId: string
  buttonLabel?: string
  className?: string
  onUploaded?: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return

    // Reset the input so picking the same file again still triggers change
    e.target.value = ''

    if (!file.type.startsWith('image/')) {
      setError('Please pick an image file')
      return
    }

    setBusy(true)
    try {
      const downscaled = await downscaleImage(file)
      const fd = new FormData()
      fd.append('file', downscaled, downscaled.name)
      fd.append('kind', kind)
      fd.append('entity_id', entityId)

      const result = await uploadAttachment(fd)
      if (result.error) {
        setError(result.error)
        return
      }

      // Refresh server data so the gallery picks up the new photo
      startTransition(() => {
        router.refresh()
        onUploaded?.()
      })
    } catch (err: any) {
      setError(err?.message ?? 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={className}
        style={{ width: 'auto', padding: '6px 12px' }}
      >
        {busy ? 'Uploading…' : buttonLabel}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChosen}
        style={{ display: 'none' }}
      />
      {error && (
        <span
          className="text-xs fg-mono"
          style={{ color: 'var(--color-red)' }}
        >
          {error}
        </span>
      )}
    </span>
  )
}

/**
 * Downscale an image to MAX_DIMENSION on its long edge, normalise EXIF
 * rotation by drawing through canvas, and re-encode as JPEG.
 *
 * Returns a new File with the same name but .jpg extension.
 */
async function downscaleImage(file: File): Promise<File> {
  const dataUrl = await readAsDataURL(file)
  const img = await loadImage(dataUrl)

  // Compute target dimensions
  const longEdge = Math.max(img.width, img.height)
  const scale = longEdge > MAX_DIMENSION ? MAX_DIMENSION / longEdge : 1
  const targetW = Math.round(img.width * scale)
  const targetH = Math.round(img.height * scale)

  // Draw through canvas (this also bakes in EXIF rotation in modern
  // browsers, which decode rotation natively when loading the <img>)
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

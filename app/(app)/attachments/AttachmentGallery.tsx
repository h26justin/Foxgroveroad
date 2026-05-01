'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteAttachment } from './actions'
import type { AttachmentWithUrl } from '@/lib/attachments'

/**
 * Display a grid of attachment thumbnails. Click a thumb → opens a
 * lightbox that takes over the screen. The uploader (and admins) see a
 * delete (×) button on each thumb.
 *
 * Pass attachments fetched server-side (with signed URLs already attached).
 */
export default function AttachmentGallery({
  attachments,
  currentUserId,
  isAdmin,
  emptyHint,
}: {
  attachments: AttachmentWithUrl[]
  currentUserId: string
  isAdmin: boolean
  emptyHint?: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  function canDelete(a: AttachmentWithUrl): boolean {
    return isAdmin || a.created_by === currentUserId
  }

  async function handleDelete(a: AttachmentWithUrl) {
    if (!confirm('Delete this photo?')) return
    setDeleting(a.id)
    try {
      const r = await deleteAttachment(a.id)
      if (r.error) {
        alert(r.error)
        return
      }
      startTransition(() => router.refresh())
    } finally {
      setDeleting(null)
    }
  }

  if (attachments.length === 0) {
    return emptyHint ? (
      <div
        className="text-xs fg-mono"
        style={{ color: 'var(--color-muted)' }}
      >
        {emptyHint}
      </div>
    ) : null
  }

  return (
    <>
      <div className="fg-attachment-grid">
        {attachments.map((a, idx) => (
          <div key={a.id} className="fg-attachment-thumb">
            <button
              type="button"
              onClick={() => setLightboxIndex(idx)}
              className="fg-attachment-thumb-button"
              aria-label="View photo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.signed_url} alt={a.caption ?? ''} />
            </button>
            {canDelete(a) && (
              <button
                type="button"
                onClick={() => handleDelete(a)}
                disabled={deleting === a.id}
                className="fg-attachment-thumb-delete"
                aria-label="Delete photo"
              >
                ×
              </button>
            )}
            {a.caption && (
              <div className="fg-attachment-thumb-caption">{a.caption}</div>
            )}
          </div>
        ))}
      </div>

      {lightboxIndex !== null && attachments[lightboxIndex] && (
        <Lightbox
          attachment={attachments[lightboxIndex]}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < attachments.length - 1}
          onPrev={() => setLightboxIndex(lightboxIndex - 1)}
          onNext={() => setLightboxIndex(lightboxIndex + 1)}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}

function Lightbox({
  attachment,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
}: {
  attachment: AttachmentWithUrl
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}) {
  return (
    <div
      className="fg-lightbox"
      onClick={onClose}
      role="dialog"
      aria-label="Photo viewer"
    >
      <button
        type="button"
        className="fg-lightbox-close"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="Close"
      >
        ×
      </button>
      {hasPrev && (
        <button
          type="button"
          className="fg-lightbox-nav fg-lightbox-prev"
          onClick={(e) => {
            e.stopPropagation()
            onPrev()
          }}
          aria-label="Previous photo"
        >
          ‹
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          className="fg-lightbox-nav fg-lightbox-next"
          onClick={(e) => {
            e.stopPropagation()
            onNext()
          }}
          aria-label="Next photo"
        >
          ›
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachment.signed_url}
        alt={attachment.caption ?? ''}
        onClick={(e) => e.stopPropagation()}
      />
      {attachment.caption && (
        <div className="fg-lightbox-caption">{attachment.caption}</div>
      )}
    </div>
  )
}

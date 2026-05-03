'use client'

export default function CancelBookingButton({
  requestId,
  isApproved,
}: {
  requestId: string
  isApproved: boolean
}) {
  const message = isApproved
    ? 'Cancel this approved booking? Your bed assignments will be released.'
    : 'Cancel this booking request?'

  return (
    <form
      action={`/bookings/${requestId}/cancel`}
      method="POST"
      onSubmit={(e) => {
        if (!confirm(message)) {
          e.preventDefault()
        }
      }}
    >
      <button
        type="submit"
        className="fg-btn-ghost text-xs"
        title="Cancel this booking"
        style={{
          width: 'auto',
          padding: '6px 12px',
          color: 'var(--color-red)',
        }}
      >
        Cancel
      </button>
    </form>
  )
}

import type { RoomStatus, RoomStatusInfo } from '@/lib/room-status'
import { STATUS_LABEL } from '@/lib/room-status'

/**
 * Small coloured dot showing a bedroom's status.
 *
 * Used in three places: housekeeping room rows, the house calendar's
 * left axis, and the dashboard's bedroom-status section. No hooks /
 * event handlers, so it works in both server and client components.
 */
const COLORS: Record<RoomStatus, string> = {
  green: 'var(--color-green, #2f7a4f)',
  orange: 'var(--color-amber, #A8862E)',
  red: 'var(--color-red, #b04030)',
}

export default function RoomStatusLight({
  info,
  size = 10,
}: {
  info: RoomStatusInfo | undefined
  size?: number
}) {
  // No info (e.g. non-bedroom row) → render nothing
  if (!info) return null
  const label = `${STATUS_LABEL[info.status]} — ${info.reason}`
  return (
    <span
      title={label}
      aria-label={label}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: COLORS[info.status],
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
    />
  )
}

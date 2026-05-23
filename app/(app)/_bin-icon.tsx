import {
  Trash2,
  Recycle,
  Newspaper,
  LeafyGreen,
  Sprout,
  Battery,
  Shirt,
  Sofa,
  Wine,
  type LucideIcon,
} from 'lucide-react'

/**
 * Compact bin chip — colored circle background + line icon — used in
 * the dashboard collection list and the housekeeping reminder banner.
 *
 * Colors loosely match UK council bin conventions:
 *   brown caddy  → food waste
 *   blue box     → paper & card
 *   green box    → mixed recycling
 *   black bin    → refuse / general waste
 *   green/brown  → garden
 *   red          → batteries
 *   purple       → textiles
 *   grey         → bulky
 *   amber        → glass
 */
type ServiceMatch = {
  Icon: LucideIcon
  /** background fill for the chip */
  bg: string
  /** stroke color for the icon */
  fg: string
}

function matchService(name: string): ServiceMatch {
  const s = name.toLowerCase()
  if (s.includes('food'))
    return { Icon: LeafyGreen, bg: '#7c4a14', fg: '#fff' }
  if (s.includes('paper') || s.includes('cardboard') || s.includes('card'))
    return { Icon: Newspaper, bg: '#1e40af', fg: '#fff' }
  if (s.includes('garden'))
    return { Icon: Sprout, bg: '#365314', fg: '#fff' }
  if (s.includes('battery') || s.includes('batteries') || s.includes('electrical'))
    return { Icon: Battery, bg: '#b91c1c', fg: '#fff' }
  if (s.includes('textile'))
    return { Icon: Shirt, bg: '#6d28d9', fg: '#fff' }
  if (s.includes('bulky'))
    return { Icon: Sofa, bg: '#6b7280', fg: '#fff' }
  if (s.includes('glass') && !s.includes('mixed'))
    return { Icon: Wine, bg: '#d97706', fg: '#fff' }
  if (s.includes('recycl'))
    return { Icon: Recycle, bg: '#16a34a', fg: '#fff' }
  // Fallback: refuse / non-recyclable / general
  return { Icon: Trash2, bg: '#374151', fg: '#fff' }
}

export default function BinIcon({
  service,
  size = 24,
}: {
  service: string
  size?: number
}) {
  const { Icon, bg, fg } = matchService(service)
  const iconSize = Math.round(size * 0.62)
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 999,
        background: bg,
        color: fg,
        flexShrink: 0,
      }}
    >
      <Icon size={iconSize} strokeWidth={2} />
    </span>
  )
}

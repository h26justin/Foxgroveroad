/**
 * Shared skeleton shells used by route-level loading.tsx files.
 *
 * Why: Next 16 only prefetches dynamic routes when they ship a
 * loading.tsx boundary. The actual visual fidelity of the skeleton
 * matters less than just having one — even a generic header+card
 * makes navigation feel instant because the shell appears the moment
 * the user clicks.
 */

export function FormShell({ headerWidth = 160 }: { headerWidth?: number }) {
  return (
    <div>
      <div className="mb-8">
        <div className="fg-skeleton mb-2" style={{ width: 80, height: 11 }} />
        <div
          className="fg-skeleton mb-3"
          style={{ width: headerWidth, height: 36 }}
        />
        <div className="fg-skeleton" style={{ width: 240, height: 12 }} />
      </div>
      <div className="fg-skeleton" style={{ height: 320, borderRadius: 16 }} />
    </div>
  )
}

export function ListShell({ rows = 5, rowHeight = 72 }: { rows?: number; rowHeight?: number }) {
  return (
    <div>
      <div className="mb-8">
        <div className="fg-skeleton mb-2" style={{ width: 80, height: 11 }} />
        <div className="fg-skeleton mb-3" style={{ width: 180, height: 36 }} />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="fg-skeleton"
            style={{ height: rowHeight, borderRadius: 14 }}
          />
        ))}
      </div>
    </div>
  )
}

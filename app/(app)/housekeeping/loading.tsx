export default function Loading() {
  return (
    <div>
      <div className="mb-5">
        <div className="fg-skeleton mb-2" style={{ width: 140, height: 11 }} />
        <div className="fg-skeleton mb-3" style={{ width: 220, height: 36 }} />
        <div className="fg-skeleton" style={{ width: 280, height: 12 }} />
      </div>
      <div className="flex gap-2 mb-5 overflow-hidden">
        {[60, 110, 90, 100, 80].map((w, i) => (
          <div
            key={i}
            className="fg-skeleton shrink-0"
            style={{ width: w, height: 28, borderRadius: 999 }}
          />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="fg-skeleton"
            style={{ height: 56, borderRadius: 16 }}
          />
        ))}
      </div>
    </div>
  )
}

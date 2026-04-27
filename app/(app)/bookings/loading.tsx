export default function Loading() {
  return (
    <div>
      <div className="mb-8">
        <div className="fg-skeleton mb-2" style={{ width: 180, height: 32 }} />
        <div className="fg-skeleton" style={{ width: 220, height: 12 }} />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="fg-skeleton"
            style={{ height: 96, borderRadius: 16 }}
          />
        ))}
      </div>
    </div>
  )
}

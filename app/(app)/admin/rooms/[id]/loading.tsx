export default function Loading() {
  return (
    <div>
      <div className="mb-6">
        <div className="fg-skeleton mb-3" style={{ width: 80, height: 11 }} />
        <div className="fg-skeleton mb-2" style={{ width: 240, height: 32 }} />
        <div className="fg-skeleton" style={{ width: 200, height: 12 }} />
      </div>
      <div className="fg-skeleton mb-3" style={{ width: 100, height: 11 }} />
      <div className="fg-skeleton mb-10" style={{ height: 240, borderRadius: 16 }} />
      <div className="fg-skeleton mb-3" style={{ width: 180, height: 11 }} />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="fg-skeleton"
            style={{ height: 64, borderRadius: 16 }}
          />
        ))}
      </div>
    </div>
  )
}

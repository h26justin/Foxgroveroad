export default function Loading() {
  return (
    <div>
      <div className="mb-6">
        <div className="fg-skeleton mb-2" style={{ width: 180, height: 36 }} />
        <div className="fg-skeleton" style={{ width: 280, height: 12 }} />
      </div>
      <div className="fg-skeleton mb-5" style={{ height: 80, borderRadius: 16 }} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="fg-skeleton"
            style={{ height: 140, borderRadius: 14 }}
          />
        ))}
      </div>
    </div>
  )
}

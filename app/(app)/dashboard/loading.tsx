export default function Loading() {
  return (
    <div>
      <div className="mb-8">
        <div className="fg-skeleton mb-2" style={{ width: 160, height: 32 }} />
        <div className="fg-skeleton" style={{ width: 240, height: 12 }} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="fg-skeleton"
            style={{ height: 120, borderRadius: 16 }}
          />
        ))}
      </div>
    </div>
  )
}

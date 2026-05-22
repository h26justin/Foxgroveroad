export default function Loading() {
  return (
    <div>
      <div className="mb-5">
        <div className="fg-skeleton mb-2" style={{ width: 80, height: 11 }} />
        <div className="fg-skeleton mb-3" style={{ width: 120, height: 36 }} />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="fg-skeleton"
            style={{ height: 88, borderRadius: 16 }}
          />
        ))}
      </div>
    </div>
  )
}

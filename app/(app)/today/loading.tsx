export default function Loading() {
  return (
    <div>
      <div className="mb-6">
        <div
          className="fg-skeleton mb-2"
          style={{ width: 140, height: 11 }}
        />
        <div
          className="fg-skeleton mb-3"
          style={{ width: 160, height: 36 }}
        />
        <div className="fg-skeleton" style={{ width: 220, height: 12 }} />
      </div>

      {[0, 1, 2].map((i) => (
        <section key={i} className="mb-8">
          <div className="fg-skeleton mb-3" style={{ width: 180, height: 18 }} />
          <div className="space-y-2">
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="fg-skeleton"
                style={{ height: 64, borderRadius: 14 }}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

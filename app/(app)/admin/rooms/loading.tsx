export default function Loading() {
  return (
    <div>
      <div className="mb-8">
        <div className="fg-skeleton mb-2" style={{ width: 100, height: 30 }} />
        <div className="fg-skeleton" style={{ width: 200, height: 12 }} />
      </div>
      {[0, 1, 2].map((i) => (
        <section key={i} className="mb-10">
          <div className="fg-skeleton mb-3" style={{ width: 140, height: 22 }} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((j) => (
              <div
                key={j}
                className="fg-skeleton"
                style={{ height: 96, borderRadius: 16 }}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

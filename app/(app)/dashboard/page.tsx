import { requireUser } from '@/lib/auth'

export default async function DashboardPage() {
  const user = await requireUser()

  const summary = roleSummary(user.role)

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div>
        <p className="fg-section-label">{summary.eyebrow}</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          {summary.greeting}, {user.full_name.split(' ')[0]}
        </h1>
        <p className="fg-mono mt-2 text-sm text-[color:var(--color-muted)]">
          {summary.subhead}
        </p>
      </div>

      {/* Cards grid */}
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {summary.cards.map((c) => (
          <article key={c.title} className="fg-card fg-card-hover">
            <div className="flex items-start justify-between">
              <span
                className="fg-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)]"
              >
                {c.eyebrow}
              </span>
              <span className={`fg-pill ${c.pill}`}>{c.pillLabel}</span>
            </div>
            <h3 className="mt-3 text-lg font-bold">{c.title}</h3>
            <p className="fg-mono mt-2 text-sm leading-relaxed text-[color:var(--color-muted)]">
              {c.body}
            </p>
          </article>
        ))}
      </div>

      {/* Plumbing-complete confirmation banner */}
      <div
        className="mt-12 rounded-2xl border-2 border-dashed p-6"
        style={{ borderColor: 'rgba(168, 134, 46, 0.4)', background: 'rgba(200, 168, 75, 0.07)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="block h-2 w-2 rounded-full"
            style={{ background: 'var(--color-gold)' }}
          />
          <p className="fg-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-gold)]">
            Foundation complete
          </p>
        </div>
        <p className="fg-mono mt-2 text-sm text-[color:var(--color-ink)]">
          Auth, layout, env and roles are all working. Next pass we'll build the family
          booking form and the house-map drag-and-drop view.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

type CardSpec = {
  title: string
  body: string
  eyebrow: string
  pill: string
  pillLabel: string
}

type Summary = {
  eyebrow: string
  greeting: string
  subhead: string
  cards: CardSpec[]
}

function roleSummary(role: string): Summary {
  if (role === 'admin') {
    return {
      eyebrow: 'Admin · Dashboard',
      greeting: 'Welcome back',
      subhead: 'Approve room requests, assign cleaners, keep the house running.',
      cards: [
        {
          eyebrow: 'House map',
          title: 'Drag pending bookings onto beds',
          body: 'Visual floor plan view with same-day turnaround warnings.',
          pill: 'fg-pill-gold',
          pillLabel: 'soon',
        },
        {
          eyebrow: 'Pending requests',
          title: 'Review family booking requests',
          body: 'Approve, decline, or pencil-in stays from the inbox.',
          pill: 'fg-pill-amber',
          pillLabel: 'soon',
        },
        {
          eyebrow: "Today's cleaning",
          title: "Who's working, what's outstanding",
          body: 'Live status of every turnaround with photo proof when done.',
          pill: 'fg-pill-blue',
          pillLabel: 'soon',
        },
        {
          eyebrow: 'Linen levels',
          title: 'Sheets, duvets, towels in circulation',
          body: 'Auto-decremented on turnarounds; alerts when stocks dip.',
          pill: 'fg-pill-green',
          pillLabel: 'soon',
        },
      ],
    }
  }

  if (role === 'cleaner') {
    return {
      eyebrow: 'Cleaner · Today',
      greeting: 'Morning',
      subhead: 'Your tasks for today and your upcoming shifts at a glance.',
      cards: [
        {
          eyebrow: 'Today',
          title: 'Your tasks for today',
          body: 'Tickable checklists, photo upload, and notes back to admin.',
          pill: 'fg-pill-blue',
          pillLabel: 'soon',
        },
        {
          eyebrow: 'Schedule',
          title: 'Upcoming shifts',
          body: 'See the week ahead, with rooms you can plan for.',
          pill: 'fg-pill-muted',
          pillLabel: 'soon',
        },
      ],
    }
  }

  // family
  return {
    eyebrow: 'Family · Dashboard',
    greeting: 'Hello',
    subhead: 'Request a room, see your upcoming stays, and who else is coming.',
    cards: [
      {
        eyebrow: 'Book a room',
        title: 'Request a room and dates',
        body: 'Pick a room, dates, and add notes. Admin will approve.',
        pill: 'fg-pill-gold',
        pillLabel: 'soon',
      },
      {
        eyebrow: 'My stays',
        title: 'Upcoming and past stays',
        body: 'See the status of your bookings and which bed you got.',
        pill: 'fg-pill-blue',
        pillLabel: 'soon',
      },
    ],
  }
}

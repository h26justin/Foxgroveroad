import Link from 'next/link'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getFeatureFlags } from '@/lib/feature-flags'
import { getAllRoomStatuses, STATUS_LABEL } from '@/lib/room-status'
import { floorLabelShort } from '@/lib/floors'
import {
  todayISO,
  formatDateShort,
  formatDate,
  nightsBetween,
  relativeFromToday,
} from '@/lib/dates'
import {
  getBinCacheWithBackgroundRefresh,
  nextCollections,
  reminderForToday,
} from '@/lib/bin-collections'
import BinSection from './BinSection'

// Soft 30s cache. Booking and task data changes through user actions
// elsewhere in the app, all of which call revalidatePath; this ceiling
// just bounds how stale the dashboard can be when nobody's actively
// editing.
export const revalidate = 30

/**
 * Dashboard / home page.
 *
 * Sections (in render order):
 *   1. "Right now in the house"   — currently checked-in bookings
 *   2. "Coming up"                 — approved bookings in next 14 days
 *   3. "Today's tasks"             — admin/cleaner only; counts + links
 *   4. "Quick actions"             — role-aware buttons
 *
 * Family users see (1) + (2) + (4). Admins see all four. Cleaners are
 * routed to /housekeeping by app/page.tsx, but if they navigate here
 * directly we still render — they get (1) + (2) + (3) + (4).
 */
export default async function DashboardPage() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const today = todayISO()
  const fortnightOut = (() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() + 14)
    return d.toISOString().split('T')[0]
  })()

  const isAdmin = profile.role === 'admin'
  const isCleaner = profile.role === 'cleaner'
  const showsTasks = isAdmin || isCleaner

  // Run everything in parallel. Task-related queries only fire for
  // admin/cleaner.
  const [
    inHouseRes,
    upcomingRes,
    overdueCountRes,
    dueTodayCountRes,
    completedTodayCountRes,
    openIssuesCountRes,
    pendingOneshotsRes,
    pendingRequestsCountRes,
    flags,
    bedroomRoomsRes,
    roomStatuses,
    binCache,
  ] = await Promise.all([
    // (1) Currently checked-in: approved bookings spanning today
    supabase
      .from('bookings')
      .select(
        'id, request_id, check_in, check_out, guest_name, beds:beds!bookings_bed_id_fkey(name, room_id, rooms:rooms!beds_room_id_fkey(name, floor))',
      )
      .eq('status', 'approved')
      .lte('check_in', today)
      .gt('check_out', today)
      .order('check_out'),
    // (2) Coming up: approved bookings starting in (today, today+14]
    supabase
      .from('bookings')
      .select(
        'id, request_id, check_in, check_out, guest_name, beds:beds!bookings_bed_id_fkey(name, room_id, rooms:rooms!beds_room_id_fkey(name, floor))',
      )
      .eq('status', 'approved')
      .gt('check_in', today)
      .lte('check_in', fortnightOut)
      .order('check_in'),
    // (3a) Overdue task count
    showsTasks
      ? supabase
          .from('cleaner_tasks_today')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'overdue')
      : Promise.resolve({ count: 0 } as any),
    // (3b) Due-today task count
    showsTasks
      ? supabase
          .from('cleaner_tasks_today')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'due')
      : Promise.resolve({ count: 0 } as any),
    // (3c) Completed today
    showsTasks
      ? supabase
          .from('task_completions')
          .select('id', { count: 'exact', head: true })
          .eq('completed_at_date', today)
      : Promise.resolve({ count: 0 } as any),
    // (3d) Open issues
    showsTasks
      ? supabase
          .from('issues')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open')
      : Promise.resolve({ count: 0 } as any),
    // (3e) Pending one-offs — full rows so the dashboard can show the
    // descriptions in full (v32). Admin/cleaner only.
    showsTasks
      ? supabase
          .from('oneshot_tasks')
          .select(
            'id, description, priority, room_id, created_at, rooms:rooms!oneshot_tasks_room_id_fkey(name), creator:profiles!oneshot_tasks_created_by_fkey(full_name)',
          )
          .eq('status', 'pending')
          .order('priority', { ascending: false }) // urgent first
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] } as any),
    // (4) For admin: pending booking-request count (drives the badge
    // and the "review pending" quick action)
    isAdmin
      ? supabase
          .from('booking_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
      : Promise.resolve({ count: 0 } as any),
    // Feature flags — drive whether issue / one-shot blocks render
    getFeatureFlags(),
    // (5) Bedrooms list — for the v31 status-light section
    supabase
      .from('rooms')
      .select('id, name, floor')
      .eq('room_type', 'bedroom')
      .order('floor', { ascending: false })
      .order('name'),
    // (5b) Room statuses — derived from existing data
    getAllRoomStatuses(supabase, today),
    // (6) Bin collections — reads cache instantly. If the cache is
    // stale (>12h), a refresh fires AFTER the response is sent via
    // next/server.after — never blocks the dashboard render.
    getBinCacheWithBackgroundRefresh(),
  ])

  const inHouse = (inHouseRes.data as any[]) ?? []
  const upcoming = (upcomingRes.data as any[]) ?? []
  const overdueCount = overdueCountRes.count ?? 0
  const dueTodayCount = dueTodayCountRes.count ?? 0
  const completedTodayCount = completedTodayCountRes.count ?? 0
  const openIssuesCount = openIssuesCountRes.count ?? 0
  const pendingOneshots = (pendingOneshotsRes.data as any[]) ?? []
  const pendingOneshotsCount = pendingOneshots.length
  const pendingRequestsCount = pendingRequestsCountRes.count ?? 0
  const issuesEnabled = flags['issues'] !== false
  const oneshotsEnabled = flags['oneshot_tasks'] !== false

  // Group by booking_request so the same family booking 5 beds shows
  // as one row rather than five.
  const inHouseGroups = groupByRequest(inHouse)
  const upcomingGroups = groupByRequest(upcoming)

  // ─── Bedroom status (v31) ─────────────────────────────────────────
  const bedroomRooms = (bedroomRoomsRes.data as any[]) ?? []
  const bedroomCounts = { green: 0, orange: 0, red: 0 }
  for (const r of bedroomRooms) {
    const s = roomStatuses.get(r.id)?.status ?? 'green'
    bedroomCounts[s]++
  }
  // Group bedrooms by floor for compact column display
  const _bedroomsByFloor = new Map<number, { id: string; name: string }[]>()
  for (const r of bedroomRooms) {
    const list = _bedroomsByFloor.get(r.floor) ?? []
    list.push({ id: r.id, name: r.name })
    _bedroomsByFloor.set(r.floor, list)
  }
  const bedroomRoomsByFloor = Array.from(_bedroomsByFloor.entries())
    .sort((a, b) => b[0] - a[0]) // top of house first
    .map(([floor, rooms]) => ({ floor, rooms }))

  // ─── Bin collections (v42) ────────────────────────────────────────
  const binUpcoming = nextCollections((binCache as any).events ?? [], 3, today)
  const binReminder = reminderForToday((binCache as any).events ?? [], today)
  const binNotConfigured = !(binCache as any).source_url
  const binHasError = !!(binCache as any).error

  return (
    <div>
      {/* Title + greeting --------------------------------------------- */}
      <div className="mb-8">
        <p
          className="fg-section-label"
          style={{ marginBottom: 4 }}
        >
          {formatDate(today)}
        </p>
        <h1
          className="text-3xl"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
          }}
        >
          {greetingFor(profile.full_name)}
        </h1>
      </div>

      {/* Bin collections (v42) — high priority because the reminder
          banner needs to be seen first thing on visit. */}
      <div className="mb-8">
        <BinSection
          upcoming={binUpcoming}
          reminder={binReminder}
          hasError={binHasError}
          notConfigured={binNotConfigured}
        />
      </div>

      {/* (0) Pending one-off tasks (v32) ----------------------------- */}
      {showsTasks && oneshotsEnabled && pendingOneshots.length > 0 && (
        <section className="mb-8">
          <h2
            className="mb-3 flex items-baseline gap-3 flex-wrap"
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              color: 'var(--color-ink)',
            }}
          >
            <span>One-off tasks</span>
            <span
              className="fg-mono text-xs"
              style={{ color: 'var(--color-muted)' }}
            >
              {pendingOneshots.length} pending
            </span>
          </h2>
          <div className="space-y-2">
            {pendingOneshots.map((t: any) => {
              const isUrgent = t.priority === 'urgent'
              const roomName = (t.rooms as any)?.name as string | undefined
              const creator =
                (t.creator as any)?.full_name as string | undefined
              const created = new Date(t.created_at)
              const ago = relativeFromCreated(created)
              return (
                <div
                  key={t.id}
                  className="fg-card p-4"
                  style={
                    isUrgent
                      ? {
                          borderLeftWidth: 4,
                          borderLeftStyle: 'solid',
                          borderLeftColor: 'var(--color-red, #b04030)',
                        }
                      : undefined
                  }
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginBottom: 6,
                    }}
                  >
                    {isUrgent && (
                      <span
                        className="fg-pill text-xs"
                        style={{
                          background: 'var(--color-red, #b04030)',
                          color: 'white',
                        }}
                      >
                        urgent
                      </span>
                    )}
                    {roomName && (
                      <span
                        className="fg-mono text-xs"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        {roomName}
                      </span>
                    )}
                    <span
                      className="fg-mono text-xs"
                      style={{ color: 'var(--color-muted)', marginLeft: 'auto' }}
                    >
                      {creator ?? 'Admin'} · {ago}
                    </span>
                  </div>
                  <div
                    style={{
                      color: 'var(--color-ink)',
                      fontSize: 14,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {t.description}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* (1) Right now in the house --------------------------------- */}
      <section className="mb-8">
        <h2
          className="mb-3"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            color: 'var(--color-ink)',
          }}
        >
          Right now in the house
        </h2>
        {inHouseGroups.length === 0 ? (
          <div className="fg-card p-5">
            <p
              className="text-sm fg-mono"
              style={{ color: 'var(--color-muted)' }}
            >
              No-one's in the house right now.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {inHouseGroups.map((g) => (
              <div key={g.requestId} className="fg-card p-4">
                <div
                  className="text-base"
                  style={{
                    fontFamily: 'var(--font-serif)',
                    color: 'var(--color-ink)',
                  }}
                >
                  {g.guestLabel}
                </div>
                <div
                  className="fg-mono text-xs mt-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {g.roomNames.join(' · ')}
                </div>
                <div
                  className="fg-mono text-xs mt-2"
                  style={{ color: 'var(--color-ink)' }}
                >
                  Checks out {formatDateShort(g.checkOut)} ·{' '}
                  {pluralise(
                    Math.max(0, nightsBetween(today, g.checkOut)),
                    'night',
                  )}{' '}
                  to go
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* (1.5) Bedroom status (v31) ---------------------------------- */}
      <section className="mb-8">
        <h2
          className="mb-3 flex items-baseline gap-3 flex-wrap"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            color: 'var(--color-ink)',
          }}
        >
          <span>Bedroom status</span>
          <span
            className="fg-mono text-xs"
            style={{ color: 'var(--color-muted)' }}
          >
            {bedroomCounts.green} ready · {bedroomCounts.orange} occupied ·{' '}
            {bedroomCounts.red} need cleaning
          </span>
        </h2>
        <div className="fg-card p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
            {bedroomRoomsByFloor.map(({ floor, rooms: floorRooms }) => (
              <div key={floor} className="md:col-span-1">
                <div
                  className="fg-section-label mb-2"
                  style={{ fontSize: 10 }}
                >
                  {floorLabelShort(floor)}
                </div>
                <ul className="space-y-1">
                  {floorRooms.map((r) => {
                    const info = roomStatuses.get(r.id)
                    const status = info?.status ?? 'green'
                    const color =
                      status === 'green'
                        ? 'var(--color-green, #2f7a4f)'
                        : status === 'orange'
                          ? 'var(--color-amber, #A8862E)'
                          : 'var(--color-red, #b04030)'
                    return (
                      <li
                        key={r.id}
                        className="flex items-center gap-2 text-sm"
                        style={{ color: 'var(--color-ink)' }}
                        title={info?.reason ?? STATUS_LABEL[status]}
                      >
                        <span
                          aria-label={STATUS_LABEL[status]}
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: color,
                            flexShrink: 0,
                          }}
                        />
                        <span className="truncate">{r.name}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* (2) Coming up ----------------------------------------------- */}
      <section className="mb-8">
        <h2
          className="mb-3"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            color: 'var(--color-ink)',
          }}
        >
          Coming up · next 14 days
        </h2>
        {upcomingGroups.length === 0 ? (
          <div className="fg-card p-5">
            <p
              className="text-sm fg-mono"
              style={{ color: 'var(--color-muted)' }}
            >
              No bookings in the next two weeks.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upcomingGroups.map((g) => (
              <div key={g.requestId} className="fg-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <div
                    className="text-base"
                    style={{
                      fontFamily: 'var(--font-serif)',
                      color: 'var(--color-ink)',
                    }}
                  >
                    {g.guestLabel}
                  </div>
                  <span
                    className="fg-pill"
                    style={{ flexShrink: 0 }}
                  >
                    {relativeFromToday(g.checkIn)}
                  </span>
                </div>
                <div
                  className="fg-mono text-xs mt-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {g.roomNames.join(' · ')}
                </div>
                <div
                  className="fg-mono text-xs mt-2"
                  style={{ color: 'var(--color-ink)' }}
                >
                  {formatDateShort(g.checkIn)} → {formatDateShort(g.checkOut)}{' '}
                  · {pluralise(nightsBetween(g.checkIn, g.checkOut), 'night')}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* (3) Today's tasks (admin/cleaner only) --------------------- */}
      {showsTasks && (
        <section className="mb-8">
          <h2
            className="mb-3"
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              color: 'var(--color-ink)',
            }}
          >
            Today's tasks
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              href="/housekeeping"
              label="Overdue"
              value={overdueCount}
              tone={overdueCount > 0 ? 'warn' : 'neutral'}
            />
            <StatCard
              href="/housekeeping"
              label="Due today"
              value={dueTodayCount}
              tone="neutral"
            />
            <StatCard
              href="/housekeeping"
              label="Done today"
              value={completedTodayCount}
              tone={completedTodayCount > 0 ? 'good' : 'neutral'}
            />
            {issuesEnabled && (
              <StatCard
                href="/issues"
                label="Open issues"
                value={openIssuesCount}
                tone={openIssuesCount > 0 ? 'warn' : 'neutral'}
              />
            )}
          </div>
        </section>
      )}

      {/* (4) Quick actions ------------------------------------------- */}
      <section>
        <h2
          className="mb-3"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            color: 'var(--color-ink)',
          }}
        >
          Quick actions
        </h2>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <>
              <Link href="/house/new-booking" className="fg-btn-gold">
                + New booking
              </Link>
              {pendingRequestsCount > 0 && (
                <Link href="/house" className="fg-btn-ghost">
                  Review {pluralise(pendingRequestsCount, 'pending request')} →
                </Link>
              )}
              <Link href="/admin/overview" className="fg-btn-ghost">
                14-day overview →
              </Link>
              <Link href="/admin/plants" className="fg-btn-ghost">
                Manage plants →
              </Link>
            </>
          )}
          {!isAdmin && !isCleaner && (
            <Link href="/bookings/new" className="fg-btn-gold">
              + Request a stay
            </Link>
          )}
          <Link href="/house" className="fg-btn-ghost">
            View calendar →
          </Link>
          {isCleaner && (
            <Link href="/housekeeping" className="fg-btn-ghost">
              Open today's tasks →
            </Link>
          )}
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

type BookingRow = {
  id: string
  request_id: string
  check_in: string
  check_out: string
  guest_name: string | null
  beds: any
}

type Group = {
  requestId: string
  checkIn: string
  checkOut: string
  guestLabel: string
  roomNames: string[]
}

/**
 * Collapse multi-bed bookings into one row per booking_request.
 *
 * The `bookings` table has one row per bed; a single family booking
 * 4 beds in 2 rooms produces 4 rows. The dashboard wants to surface
 * "the family in the East Wing for 3 nights", not four near-identical
 * cards. We group by request_id, concatenate guest names, and dedupe
 * room names.
 */
function groupByRequest(rows: BookingRow[]): Group[] {
  const map = new Map<string, Group & { guestNames: Set<string> }>()
  for (const r of rows) {
    if (!r.request_id) continue
    const roomName = (r.beds as any)?.rooms?.name ?? null
    const guest = r.guest_name?.trim() ?? null
    const existing = map.get(r.request_id)
    if (existing) {
      // Widen the date range to cover any bed in this request
      if (r.check_in < existing.checkIn) existing.checkIn = r.check_in
      if (r.check_out > existing.checkOut) existing.checkOut = r.check_out
      if (roomName && !existing.roomNames.includes(roomName)) {
        existing.roomNames.push(roomName)
      }
      if (guest) existing.guestNames.add(guest)
    } else {
      const guestNames = new Set<string>()
      if (guest) guestNames.add(guest)
      map.set(r.request_id, {
        requestId: r.request_id,
        checkIn: r.check_in,
        checkOut: r.check_out,
        roomNames: roomName ? [roomName] : [],
        guestNames,
        guestLabel: '',
      })
    }
  }

  // Build a friendly guest label per group. Multiple guests → first
  // name + "+N more"; single guest → their name; none → "(no name)".
  const out: Group[] = []
  for (const g of map.values()) {
    const names = Array.from(g.guestNames)
    const guestLabel =
      names.length === 0
        ? '(no name)'
        : names.length === 1
          ? names[0]
          : `${names[0]} +${names.length - 1}`
    out.push({
      requestId: g.requestId,
      checkIn: g.checkIn,
      checkOut: g.checkOut,
      roomNames: g.roomNames.length > 0 ? g.roomNames : ['—'],
      guestLabel,
    })
  }

  // Sort: in-house by check-out (soonest leaving first), upcoming by
  // check-in (soonest arriving first). Use check-in as the tiebreaker.
  out.sort((a, b) => {
    if (a.checkIn !== b.checkIn) return a.checkIn.localeCompare(b.checkIn)
    return a.checkOut.localeCompare(b.checkOut)
  })
  return out
}

function pluralise(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function greetingFor(name: string): string {
  const hour = new Date().getHours()
  const first = name.split(' ')[0]
  if (hour < 5) return `Up late, ${first}.`
  if (hour < 12) return `Good morning, ${first}.`
  if (hour < 18) return `Good afternoon, ${first}.`
  return `Good evening, ${first}.`
}

/** "5m ago" / "2h ago" / "yesterday" / "3d ago" — for ISO timestamps. */
function relativeFromCreated(date: Date): string {
  const ms = Date.now() - date.getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

// ---------------------------------------------------------------------
// Inline stat card
// ---------------------------------------------------------------------

function StatCard({
  href,
  label,
  value,
  tone,
}: {
  href: string
  label: string
  value: number
  tone: 'neutral' | 'warn' | 'good'
}) {
  const valueColor =
    tone === 'warn'
      ? 'var(--color-amber, #A8862E)'
      : tone === 'good'
        ? 'var(--color-green, #2f7a4f)'
        : 'var(--color-ink)'

  return (
    <Link
      href={href}
      className="fg-card p-4 block hover:opacity-80 transition-opacity"
      style={{ textDecoration: 'none' }}
    >
      <div
        className="text-3xl"
        style={{
          fontFamily: 'var(--font-serif)',
          color: valueColor,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        className="fg-mono text-xs mt-1"
        style={{ color: 'var(--color-muted)' }}
      >
        {label}
      </div>
    </Link>
  )
}

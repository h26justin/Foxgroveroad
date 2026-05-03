/**
 * 14-day allocations overview (v33).
 *
 * Admin-only printable summary of the next two weeks. Layout:
 *   1. House-wide grid (rooms × dates, guest first names in cells)
 *   2. Per-room sections with full booking detail
 *   3. Arrivals + departures summary
 *
 * The page is print-ready: a "Save as PDF" button at the top opens
 * the browser print dialog where the user picks "Save as PDF" as the
 * destination. Print CSS handles page sizing, breaks, and hides the
 * print button itself.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayISO, formatDate, nightsBetween } from '@/lib/dates'
import { floorLabelShort } from '@/lib/floors'
import PrintButton from './PrintButton'

const WINDOW_DAYS = 14

export const dynamic = 'force-dynamic' // always fresh

export default async function OverviewPage() {
  const profile = await requireProfile()
  if (profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const today = todayISO()
  const days: string[] = []
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() + i)
    days.push(d.toISOString().split('T')[0])
  }
  const windowEnd = days[days.length - 1] // last day inclusive
  const windowEndExclusive = (() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() + WINDOW_DAYS)
    return d.toISOString().split('T')[0]
  })()

  const supabase = await createClient()

  // First fetch: rooms + bookings touching the window
  const [roomsRes, bookingsRes] = await Promise.all([
    supabase
      .from('rooms')
      .select('id, name, floor, room_type, is_owner_room')
      .eq('room_type', 'bedroom')
      .order('floor', { ascending: false })
      .order('name'),
    supabase
      .from('bookings')
      .select(
        `id, bed_id, request_id, check_in, check_out, guest_name,
         beds:beds!bookings_bed_id_fkey(id, room_id, name),
         request:booking_requests!bookings_request_id_fkey(
           id, check_in, check_out, adults, children, notes, requested_by,
           profiles:profiles!booking_requests_requested_by_fkey(full_name)
         )`,
      )
      .eq('status', 'approved')
      .lte('check_in', windowEnd)
      .gt('check_out', today)
      .order('check_in'),
  ])

  const rooms = (roomsRes.data as any[]) ?? []
  const bookings = (bookingsRes.data as any[]) ?? []

  // Collect unique request IDs that touch the window — used for guest
  // and prearrival lookups
  const requestIds = Array.from(
    new Set(bookings.map((b) => b.request_id).filter(Boolean) as string[]),
  )

  // Second fetch: guests + children + prearrival data for those requests
  const [guestsRes, childrenRes, prearrivalTemplatesRes, prearrivalChecksRes] =
    await Promise.all([
      requestIds.length > 0
        ? supabase
            .from('booking_request_guests')
            .select(
              'request_id, position, guests:guests!booking_request_guests_guest_id_fkey(id, full_name)',
            )
            .in('request_id', requestIds)
            .order('position')
        : Promise.resolve({ data: [] } as any),
      requestIds.length > 0
        ? supabase
            .from('booking_request_children')
            .select('request_id, age_band, sleep_arrangement, position')
            .in('request_id', requestIds)
            .order('position')
        : Promise.resolve({ data: [] } as any),
      supabase
        .from('prearrival_templates')
        .select('id, room_id, name, position')
        .order('position'),
      requestIds.length > 0
        ? supabase
            .from('prearrival_checks')
            .select('booking_request_id, template_id, room_id')
            .in('booking_request_id', requestIds)
        : Promise.resolve({ data: [] } as any),
    ])

  const guestRows = (guestsRes.data as any[]) ?? []
  const childRows = (childrenRes.data as any[]) ?? []
  const prearrivalTemplates = (prearrivalTemplatesRes.data as any[]) ?? []
  const prearrivalChecks = (prearrivalChecksRes.data as any[]) ?? []

  // ─── Index data ──────────────────────────────────────────────────
  // Bookings keyed by room — for grid + per-room sections
  const bookingsByRoom = new Map<string, any[]>()
  for (const b of bookings) {
    const roomId = (b.beds as any)?.room_id
    if (!roomId) continue
    const list = bookingsByRoom.get(roomId) ?? []
    list.push({ ...b, room_id: roomId })
    bookingsByRoom.set(roomId, list)
  }

  // Guests keyed by request
  const guestsByRequest = new Map<string, string[]>()
  for (const g of guestRows) {
    const list = guestsByRequest.get(g.request_id) ?? []
    const name = (g.guests as any)?.full_name
    if (name) list.push(name)
    guestsByRequest.set(g.request_id, list)
  }

  // Children keyed by request
  const childrenByRequest = new Map<string, any[]>()
  for (const c of childRows) {
    const list = childrenByRequest.get(c.request_id) ?? []
    list.push(c)
    childrenByRequest.set(c.request_id, list)
  }

  // Prearrival template count per room
  const prearrivalTemplateCountByRoom = new Map<string, number>()
  for (const t of prearrivalTemplates) {
    prearrivalTemplateCountByRoom.set(
      t.room_id,
      (prearrivalTemplateCountByRoom.get(t.room_id) ?? 0) + 1,
    )
  }

  // Prearrival check count per (request, room)
  const prearrivalCheckCountByKey = new Map<string, number>()
  for (const c of prearrivalChecks) {
    const key = `${c.booking_request_id}|${c.room_id}`
    prearrivalCheckCountByKey.set(
      key,
      (prearrivalCheckCountByKey.get(key) ?? 0) + 1,
    )
  }

  // ─── Grid: for each (room, day) collect labels of who's there ────
  // Key: roomId|day → array of unique request labels
  const gridCells = new Map<string, Set<string>>()
  for (const b of bookings) {
    const roomId = (b.beds as any)?.room_id
    if (!roomId) continue
    const label = labelForBooking(b)
    for (const day of days) {
      // Booking spans `day` if check_in <= day < check_out
      if (b.check_in <= day && day < b.check_out) {
        const key = `${roomId}|${day}`
        if (!gridCells.has(key)) gridCells.set(key, new Set())
        gridCells.get(key)!.add(label)
      }
    }
  }

  // ─── Per-room sections: bookings per room, grouped by request ────
  type RequestGroup = {
    requestId: string
    bookings: any[] // multiple beds in same room, same request
    request: any // the request row (notes, adults, children, requester)
    guests: string[]
    children: any[]
    prearrivalDone: number
    prearrivalTotal: number
  }

  const sectionsByRoom = new Map<string, RequestGroup[]>()
  for (const room of rooms) {
    const roomBookings = bookingsByRoom.get(room.id) ?? []
    // Group by request_id
    const byRequest = new Map<string, any[]>()
    for (const b of roomBookings) {
      const rid = b.request_id ?? `__solo_${b.id}`
      const list = byRequest.get(rid) ?? []
      list.push(b)
      byRequest.set(rid, list)
    }
    const groups: RequestGroup[] = []
    for (const [requestId, bs] of byRequest.entries()) {
      const request = (bs[0]?.request as any) ?? null
      const guests = guestsByRequest.get(requestId) ?? []
      const children = childrenByRequest.get(requestId) ?? []
      const prearrivalTotal = prearrivalTemplateCountByRoom.get(room.id) ?? 0
      const prearrivalDone =
        prearrivalCheckCountByKey.get(`${requestId}|${room.id}`) ?? 0
      groups.push({
        requestId,
        bookings: bs,
        request,
        guests,
        children,
        prearrivalDone,
        prearrivalTotal,
      })
    }
    // Sort by check-in
    groups.sort((a, b) => {
      const ai = a.bookings[0]?.check_in ?? ''
      const bi = b.bookings[0]?.check_in ?? ''
      return ai.localeCompare(bi)
    })
    if (groups.length > 0) sectionsByRoom.set(room.id, groups)
  }

  // ─── Arrivals + departures within the window ─────────────────────
  // Arrivals: bookings whose check_in falls in [today, windowEnd]
  // Departures: bookings whose check_out falls in (today, windowEndExclusive]
  // Group by request to avoid duplicate rows when one family books many beds
  const arrivalsByRequest = new Map<
    string,
    { date: string; label: string; rooms: Set<string>; nights: number }
  >()
  const departuresByRequest = new Map<
    string,
    { date: string; label: string; rooms: Set<string> }
  >()
  for (const b of bookings) {
    const requestId = b.request_id ?? `__solo_${b.id}`
    const room = rooms.find((r) => r.id === (b.beds as any)?.room_id)
    const roomName = room?.name ?? '—'
    const label = labelForBooking(b)

    if (b.check_in >= today && b.check_in <= windowEnd) {
      const existing = arrivalsByRequest.get(requestId)
      if (existing) {
        existing.rooms.add(roomName)
      } else {
        arrivalsByRequest.set(requestId, {
          date: b.check_in,
          label,
          rooms: new Set([roomName]),
          nights: nightsBetween(b.check_in, b.check_out),
        })
      }
    }
    if (b.check_out > today && b.check_out < windowEndExclusive) {
      const existing = departuresByRequest.get(requestId)
      if (existing) {
        existing.rooms.add(roomName)
      } else {
        departuresByRequest.set(requestId, {
          date: b.check_out,
          label,
          rooms: new Set([roomName]),
        })
      }
    }
  }

  const arrivals = Array.from(arrivalsByRequest.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  )
  const departures = Array.from(departuresByRequest.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  )

  return (
    <>
      {/* Inline print CSS — applies only to this page */}
      <style>{`
        @page {
          size: A4 landscape;
          margin: 12mm;
        }
        @media print {
          body { background: white !important; }
          .print-hide { display: none !important; }
          .print-page-break { page-break-before: always; }
          .print-keep { page-break-inside: avoid; }
        }
        .ov-grid {
          width: 100%;
          border-collapse: collapse;
          font-family: var(--font-mono, monospace);
          font-size: 10px;
        }
        .ov-grid th, .ov-grid td {
          border: 1px solid var(--color-warm, #e5dfd4);
          padding: 4px 6px;
          vertical-align: top;
          text-align: left;
        }
        .ov-grid th {
          background: var(--color-cream, #F4F3EF);
          font-weight: normal;
          color: var(--color-muted, #7a716a);
        }
        .ov-grid td.is-today { background: rgba(168, 134, 46, 0.08); }
        .ov-grid th.is-today {
          background: var(--color-amber, #A8862E);
          color: white;
        }
        .ov-grid .ov-room-cell {
          background: var(--color-cream, #F4F3EF);
          font-family: var(--font-serif, Georgia);
          font-size: 11px;
          color: var(--color-ink);
          width: 110px;
          white-space: nowrap;
        }
        .ov-grid .ov-day-col { width: auto; }
        .ov-cell-name {
          font-size: 10px;
          line-height: 1.3;
        }
        .ov-h1 {
          font-family: var(--font-serif, Georgia);
          font-size: 28px;
          color: var(--color-ink);
          margin: 0;
        }
        .ov-h2 {
          font-family: var(--font-serif, Georgia);
          font-size: 20px;
          color: var(--color-ink);
          margin: 0 0 8px 0;
        }
        .ov-h3 {
          font-family: var(--font-serif, Georgia);
          font-size: 16px;
          color: var(--color-ink);
          margin: 0 0 4px 0;
        }
        .ov-meta {
          font-family: var(--font-mono, monospace);
          font-size: 11px;
          color: var(--color-muted, #7a716a);
        }
        .ov-booking {
          padding: 8px 10px;
          margin-bottom: 8px;
          border-left: 3px solid var(--color-amber, #A8862E);
          background: var(--color-cream, #F4F3EF);
          page-break-inside: avoid;
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Toolbar — hidden in print */}
        <div
          className="print-hide"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <Link
            href="/dashboard"
            className="fg-btn-ghost"
            style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
          >
            ← Dashboard
          </Link>
          <PrintButton />
        </div>

        {/* Document header */}
        <header style={{ marginBottom: 20 }}>
          <h1 className="ov-h1">Foxgrove Road · 14-day overview</h1>
          <p className="ov-meta" style={{ marginTop: 4 }}>
            {formatDate(today)} → {formatDate(windowEnd)}
            {' · '}
            {bookings.length} booking{bookings.length === 1 ? '' : 's'} across{' '}
            {sectionsByRoom.size} room{sectionsByRoom.size === 1 ? '' : 's'}
          </p>
        </header>

        {/* ─── Page 1: house-wide grid ─────────────────────── */}
        <section className="print-keep" style={{ marginBottom: 24 }}>
          <h2 className="ov-h2">Allocations grid</h2>
          <table className="ov-grid">
            <thead>
              <tr>
                <th className="ov-room-cell">Room</th>
                {days.map((d) => (
                  <th
                    key={d}
                    className={`ov-day-col${d === today ? ' is-today' : ''}`}
                  >
                    {formatDayHeader(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id}>
                  <td className="ov-room-cell">
                    {room.name}
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: 'var(--color-muted)',
                        marginTop: 2,
                      }}
                    >
                      {room.is_owner_room
                        ? 'owner only'
                        : floorLabelShort(room.floor)}
                    </div>
                  </td>
                  {days.map((d) => {
                    const labels = gridCells.get(`${room.id}|${d}`)
                    return (
                      <td
                        key={d}
                        className={d === today ? 'is-today' : ''}
                        style={{ minWidth: 50 }}
                      >
                        {labels && labels.size > 0 ? (
                          <div className="ov-cell-name">
                            {Array.from(labels).map((l, i) => (
                              <div key={i}>{l}</div>
                            ))}
                          </div>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ─── Pages 2+: per-room detail ───────────────────── */}
        <div className="print-page-break" />
        <section style={{ marginBottom: 24 }}>
          <h2 className="ov-h2">Bookings by room</h2>
          {sectionsByRoom.size === 0 ? (
            <p className="ov-meta">No bookings in the next 14 days.</p>
          ) : (
            rooms
              .filter((r) => sectionsByRoom.has(r.id))
              .map((room) => {
                const groups = sectionsByRoom.get(room.id)!
                return (
                  <div
                    key={room.id}
                    className="print-keep"
                    style={{ marginBottom: 18 }}
                  >
                    <h3 className="ov-h3">
                      {room.name}
                      <span
                        className="ov-meta"
                        style={{ marginLeft: 10, fontSize: 11 }}
                      >
                        {floorLabelShort(room.floor)}
                        {' · '}
                        {groups.length} booking{groups.length === 1 ? '' : 's'}
                      </span>
                    </h3>
                    {groups.map((g) => {
                      const firstBooking = g.bookings[0]
                      const checkIn = firstBooking?.check_in ?? ''
                      const checkOut = firstBooking?.check_out ?? ''
                      const nights = nightsBetween(checkIn, checkOut)
                      const requesterName =
                        (g.request?.profiles as any)?.full_name ?? '—'
                      const adults = g.request?.adults ?? 0
                      const childCount =
                        g.request?.children ?? g.children.length
                      const bedNames = g.bookings
                        .map((b: any) => (b.beds as any)?.name)
                        .filter(Boolean)
                      return (
                        <div className="ov-booking" key={g.requestId}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 12,
                              flexWrap: 'wrap',
                              marginBottom: 4,
                            }}
                          >
                            <strong
                              style={{
                                fontFamily: 'var(--font-serif)',
                                fontSize: 14,
                                color: 'var(--color-ink)',
                              }}
                            >
                              {g.guests.length > 0
                                ? g.guests.join(', ')
                                : requesterName}
                            </strong>
                            <span className="ov-meta">
                              {formatDate(checkIn)} →{' '}
                              {formatDate(checkOut)} · {nights} night
                              {nights === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div
                            className="ov-meta"
                            style={{ marginBottom: 4, fontSize: 11 }}
                          >
                            Requested by {requesterName}
                            {' · '}
                            {adults} adult{adults === 1 ? '' : 's'}
                            {childCount > 0 &&
                              ` · ${childCount} child${childCount === 1 ? '' : 'ren'}`}
                            {bedNames.length > 0 &&
                              ` · bed${bedNames.length === 1 ? '' : 's'}: ${bedNames.join(', ')}`}
                          </div>
                          {g.request?.notes && (
                            <div
                              style={{
                                fontSize: 11,
                                color: 'var(--color-ink)',
                                marginBottom: 4,
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              <strong>Notes:</strong> {g.request.notes}
                            </div>
                          )}
                          {g.children.length > 0 && (
                            <div className="ov-meta" style={{ fontSize: 11 }}>
                              Children:{' '}
                              {g.children
                                .map(
                                  (c: any) =>
                                    `${c.age_band ?? '?'}${
                                      c.sleep_arrangement
                                        ? ` (${c.sleep_arrangement})`
                                        : ''
                                    }`,
                                )
                                .join(', ')}
                            </div>
                          )}
                          {g.prearrivalTotal > 0 && (
                            <div
                              className="ov-meta"
                              style={{
                                fontSize: 11,
                                color:
                                  g.prearrivalDone === g.prearrivalTotal
                                    ? 'var(--color-green, #2f7a4f)'
                                    : 'var(--color-amber)',
                                marginTop: 4,
                              }}
                            >
                              Prearrival prep: {g.prearrivalDone} /{' '}
                              {g.prearrivalTotal} done
                              {g.prearrivalDone === g.prearrivalTotal && ' ✓'}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })
          )}
        </section>

        {/* ─── Last page: arrivals + departures summary ────── */}
        <div className="print-page-break" />
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
          }}
        >
          <div className="print-keep">
            <h2 className="ov-h2">Arrivals</h2>
            {arrivals.length === 0 ? (
              <p className="ov-meta">No arrivals in the window.</p>
            ) : (
              <table
                className="ov-grid"
                style={{ fontSize: 11 }}
              >
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Date</th>
                    <th>Guest</th>
                    <th style={{ width: 130 }}>Room(s)</th>
                  </tr>
                </thead>
                <tbody>
                  {arrivals.map((a, i) => (
                    <tr key={i}>
                      <td className="ov-meta">{formatDate(a.date)}</td>
                      <td>{a.label}</td>
                      <td className="ov-meta">
                        {Array.from(a.rooms).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="print-keep">
            <h2 className="ov-h2">Departures</h2>
            {departures.length === 0 ? (
              <p className="ov-meta">No departures in the window.</p>
            ) : (
              <table
                className="ov-grid"
                style={{ fontSize: 11 }}
              >
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Date</th>
                    <th>Guest</th>
                    <th style={{ width: 130 }}>Room(s)</th>
                  </tr>
                </thead>
                <tbody>
                  {departures.map((d, i) => (
                    <tr key={i}>
                      <td className="ov-meta">{formatDate(d.date)}</td>
                      <td>{d.label}</td>
                      <td className="ov-meta">
                        {Array.from(d.rooms).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <footer
          style={{
            marginTop: 24,
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--color-muted)',
          }}
        >
          Generated {formatDate(today)} · Foxgrove Road
        </footer>
      </div>
    </>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Human label for a booking — guest_name first, requester first name as fallback. */
function labelForBooking(b: any): string {
  if (b.guest_name) {
    // Show first name only for compactness in the grid
    return String(b.guest_name).split(' ')[0]
  }
  const requester = (b.request as any)?.profiles?.full_name
  if (requester) return String(requester).split(' ')[0]
  return 'Guest'
}

/** "Mon\n3" style header for the day columns. */
function formatDayHeader(iso: string): React.ReactNode {
  const d = new Date(iso + 'T00:00:00')
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' })
  const dayNum = d.getDate()
  return (
    <div style={{ textAlign: 'center', lineHeight: 1.2 }}>
      <div style={{ fontSize: 9 }}>{weekday}</div>
      <div style={{ fontSize: 11, fontWeight: 600 }}>{dayNum}</div>
    </div>
  )
}

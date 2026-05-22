import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Per-user iCal feed of approved bookings.
 *
 * URL: /api/calendar/<calendar_token>
 *
 * The token IS the auth — anyone with the URL can read the feed. We
 * use the admin (service-role) client because the request is
 * anonymous from a cookie perspective: calendar apps subscribe without
 * carrying any session.
 *
 * Format: minimal iCal (RFC 5545). All-day events using DTSTART/DTEND
 * with VALUE=DATE. Apple Calendar, Google Calendar, and Outlook all
 * accept this shape.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params

  // Token shape: 64 hex chars. Reject anything else without touching
  // the DB — denies a token-fishing scanner free queries.
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return new Response('Not found', { status: 404 })
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('calendar_token', token)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!profile) {
    return new Response('Not found', { status: 404 })
  }

  const { data: requests } = await admin
    .from('booking_requests')
    .select('id, check_in, check_out, adults, children, notes')
    .eq('requested_by', (profile as any).id)
    .eq('status', 'approved')
    .order('check_in')

  const ics = buildIcs(
    (profile as any).full_name as string,
    ((requests as any[]) ?? []),
  )

  return new Response(ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      // Calendar apps poll on their own schedule; 5min lets them see
      // newly-approved bookings quickly without us serving stale data
      // for hours.
      'cache-control': 'private, max-age=300, must-revalidate',
    },
  })
}

type ReqRow = {
  id: string
  check_in: string
  check_out: string
  adults: number
  children: number | null
  notes: string | null
}

function buildIcs(userName: string, requests: ReqRow[]): string {
  const stamp = toIcsDateTime(new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Foxgrove Road//Bookings Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Foxgrove Road — ${escapeText(userName)}`,
    'X-WR-CALDESC:Approved bookings at Foxgrove Road',
  ]

  for (const r of requests) {
    const desc: string[] = []
    desc.push(`${r.adults} adult${r.adults === 1 ? '' : 's'}`)
    if (r.children && r.children > 0) {
      desc.push(`${r.children} child${r.children === 1 ? '' : 'ren'}`)
    }
    if (r.notes) desc.push(r.notes)

    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@foxgroveroad`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(r.check_in)}`,
      `DTEND;VALUE=DATE:${toIcsDate(r.check_out)}`,
      `SUMMARY:${escapeText(`Foxgrove Road — ${userName}`)}`,
      `DESCRIPTION:${escapeText(desc.join(' · '))}`,
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

/** YYYY-MM-DD → YYYYMMDD. */
function toIcsDate(iso: string): string {
  return iso.replace(/-/g, '')
}

/** Date → YYYYMMDDTHHMMSSZ (UTC). */
function toIcsDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

/** RFC 5545 text escaping. */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

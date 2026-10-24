/**
 * Date helpers for the booking flow.
 * All dates are kept as YYYY-MM-DD strings (Postgres `date` type).
 * "Today" is always the house's date (Europe/London) — Vercel runs in
 * UTC, so a plain `new Date()` is yesterday between 00:00 and 01:00 BST.
 * Day arithmetic is done in UTC on the date string, so it never shifts.
 */

export const HOUSE_TIMEZONE = 'Europe/London'

/** Today as YYYY-MM-DD in Europe/London (server or browser). */
export function todayISO(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return now.toLocaleDateString('en-CA', {
    timeZone: HOUSE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

/** YYYY-MM-DD shifted by `days` (may be negative). Timezone-proof. */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Number of nights between check-in and check-out (YYYY-MM-DD strings) */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const inDate = new Date(checkIn + 'T00:00:00')
  const outDate = new Date(checkOut + 'T00:00:00')
  const ms = outDate.getTime() - inDate.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

/** "Fri 12 May 2026" */
export function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** "12 May" — for compact display when both dates are the same year */
export function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

/** "Fri 12 May → Sun 14 May 2026 (2 nights)" */
export function formatDateRange(checkIn: string, checkOut: string): string {
  const nights = nightsBetween(checkIn, checkOut)
  const sameYear =
    new Date(checkIn).getFullYear() === new Date(checkOut).getFullYear()
  const inStr = sameYear ? formatDateShort(checkIn) : formatDate(checkIn)
  const outStr = formatDate(checkOut)
  return `${inStr} → ${outStr} · ${nights} night${nights === 1 ? '' : 's'}`
}

/** Returns "in 3 days" / "in 2 weeks" / "today" / "yesterday" / "5 days ago" */
export function relativeFromToday(iso: string): string {
  const today = new Date(todayISO() + 'T00:00:00')
  const target = new Date(iso + 'T00:00:00')
  const days = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 0 && days < 7) return `in ${days} days`
  if (days < 0 && days > -7) return `${-days} days ago`
  if (days >= 7 && days < 30)
    return `in ${Math.round(days / 7)} weeks`
  if (days <= -7 && days > -30)
    return `${Math.round(-days / 7)} weeks ago`
  if (days > 0) return `in ${Math.round(days / 30)} months`
  return `${Math.round(-days / 30)} months ago`
}

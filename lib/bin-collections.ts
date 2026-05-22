import 'server-only'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type BinEvent = {
  /** YYYY-MM-DD */
  date: string
  /** Human label e.g. "Paper & Cardboard collection" */
  summary: string
}

export type BinCacheRow = {
  source_url: string | null
  events: BinEvent[]
  fetched_at: string
  error: string | null
}

/** Refresh the cache if it's older than this. */
const CACHE_TTL_HOURS = 12

/**
 * Read the cache singleton. Returns null events list if nothing's
 * been synced yet.
 */
export async function getBinCache(): Promise<BinCacheRow> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bin_calendar_cache')
    .select('source_url, events, fetched_at, error')
    .eq('id', 'singleton')
    .maybeSingle()
  if (!data) {
    return {
      source_url: null,
      events: [],
      fetched_at: new Date(0).toISOString(),
      error: null,
    }
  }
  return {
    source_url: (data as any).source_url ?? null,
    events: Array.isArray((data as any).events)
      ? ((data as any).events as BinEvent[])
      : [],
    fetched_at: (data as any).fetched_at,
    error: (data as any).error ?? null,
  }
}

/**
 * Read the cache instantly and schedule a background refresh if it's
 * stale. The dashboard / housekeeping page should use this — never
 * blocks on the council site.
 *
 * Schedules the refresh via Next 16's `after()`, which runs after the
 * response is sent to the user. Worst-case stale window: 12h + one
 * round-trip after a stale cache is observed.
 */
export async function getBinCacheWithBackgroundRefresh(): Promise<BinCacheRow> {
  const cache = await getBinCache()
  const ageMs = Date.now() - new Date(cache.fetched_at).getTime()
  const ttlMs = CACHE_TTL_HOURS * 60 * 60 * 1000
  if (ageMs >= ttlMs || cache.events.length === 0) {
    // Schedule the refresh — the user gets the existing (stale or
    // empty) cache immediately. Errors inside the after callback never
    // affect the response.
    after(async () => {
      try {
        await refreshBinCacheIfStale(true)
      } catch (err) {
        console.warn('[bin-cache] background refresh failed:', err)
      }
    })
  }
  return cache
}

/**
 * Refresh the cache if it's stale OR if `force` is true. Pulls the
 * iCal URL from house_settings, parses it, writes the events to the
 * singleton row. Always writes — even on error, we record the error
 * string and a fresh fetched_at so we don't hammer a failing feed.
 *
 * Uses the admin client because this can be triggered from anywhere
 * (including the dashboard render, where the user might not be admin).
 *
 * NOTE: this CAN block for up to 8s on a slow council fetch. Prefer
 * getBinCacheWithBackgroundRefresh from page render paths.
 */
export async function refreshBinCacheIfStale(force = false): Promise<BinCacheRow> {
  const current = await getBinCache()
  const ageMs = Date.now() - new Date(current.fetched_at).getTime()
  const ttlMs = CACHE_TTL_HOURS * 60 * 60 * 1000
  if (!force && ageMs < ttlMs && current.events.length > 0) {
    return current
  }

  const admin = createAdminClient()
  // Read the source URL from house_settings (admin-editable).
  const { data: setting } = await admin
    .from('house_settings')
    .select('value')
    .eq('key', 'bin_calendar_url')
    .maybeSingle()
  const url = ((setting as any)?.value ?? '').trim()

  if (!url) {
    const row: BinCacheRow = {
      source_url: null,
      events: [],
      fetched_at: new Date().toISOString(),
      error: 'No bin_calendar_url set in House info',
    }
    await admin
      .from('bin_calendar_cache')
      .update({
        source_url: null,
        events: [],
        error: row.error,
        fetched_at: row.fetched_at,
        updated_at: row.fetched_at,
      } as any)
      .eq('id', 'singleton')
    return row
  }

  // Normalise: accept either the WasteWorks page URL or the .ics
  // endpoint. If the URL ends in /calendar.ics, use as-is; else append
  // /calendar.ics.
  const icsUrl = url.endsWith('.ics') ? url : url.replace(/\/$/, '') + '/calendar.ics'

  let events: BinEvent[] = []
  let error: string | null = null
  try {
    const res = await fetch(icsUrl, {
      headers: {
        // Real-browser UA — some council CDNs reject blank UAs.
        'user-agent':
          'Mozilla/5.0 FoxgroveRoad/1.0 (+https://foxgroveroad.vercel.app)',
        accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8',
      },
      // Don't let a hung remote stall the dashboard request.
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      error = `HTTP ${res.status}`
    } else {
      const text = await res.text()
      events = parseIcsEvents(text)
    }
  } catch (err: any) {
    error = err?.message ?? 'fetch failed'
  }

  const fetched_at = new Date().toISOString()
  await admin
    .from('bin_calendar_cache')
    .update({
      source_url: icsUrl,
      events: events,
      error,
      fetched_at,
      updated_at: fetched_at,
    } as any)
    .eq('id', 'singleton')

  return { source_url: icsUrl, events, fetched_at, error }
}

/**
 * Tiny iCal parser tuned for what we get from WasteWorks: VEVENTs
 * with VALUE=DATE all-day DTSTART and a SUMMARY. Returns events sorted
 * by date (ascending). Past events are kept — callers filter if they
 * only want upcoming.
 */
export function parseIcsEvents(ics: string): BinEvent[] {
  // 1. Unfold continuation lines (iCal wraps long lines, continuation
  //    starts with a leading space or tab).
  const unfolded = ics.replace(/\r?\n[ \t]/g, '')

  const events: BinEvent[] = []
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1)
  for (const block of blocks) {
    const endIdx = block.search(/END:VEVENT/i)
    if (endIdx < 0) continue
    const body = block.slice(0, endIdx)
    const summaryMatch = /^SUMMARY(?:;[^:\n]+)?:(.+)$/im.exec(body)
    const dtstartMatch = /^DTSTART(?:;[^:\n]+)?:(\d{8})/im.exec(body)
    if (!dtstartMatch) continue
    const raw = dtstartMatch[1]
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    const summary = (summaryMatch?.[1] ?? '').trim()
    events.push({ date, summary })
  }
  events.sort((a, b) => a.date.localeCompare(b.date))
  return events
}

/** YYYY-MM-DD today in Europe/London (the house's timezone). */
function todayLondon(): string {
  // toLocaleDateString with en-GB + Europe/London gives DD/MM/YYYY.
  const parts = new Date()
    .toLocaleDateString('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    .split('/')
  return `${parts[2]}-${parts[1]}-${parts[0]}`
}

export type UpcomingGroup = {
  /** YYYY-MM-DD */
  date: string
  /** Distinct service names on that date */
  services: string[]
}

/**
 * Group cached events by date, keep only the next `count` collection
 * dates from today onwards.
 */
export function nextCollections(
  events: BinEvent[],
  count = 3,
  today: string = todayLondon(),
): UpcomingGroup[] {
  const byDate = new Map<string, Set<string>>()
  for (const ev of events) {
    if (ev.date < today) continue
    const cleaned = friendlyServiceName(ev.summary)
    if (!byDate.has(ev.date)) byDate.set(ev.date, new Set())
    byDate.get(ev.date)!.add(cleaned)
  }
  const groups: UpcomingGroup[] = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([date, set]) => ({ date, services: Array.from(set).sort() }))
  return groups
}

/**
 * Produce the reminder banner state for cleaners on a given day.
 *
 *   D-1  → "Put bins out tonight" (action: put_out)
 *   D    → "Collection today" (info)
 *   D+1  → "Bring bins back in" (action: bring_in)
 *
 * Returns null if today is none of those for any upcoming collection.
 */
export type BinReminder =
  | {
      kind: 'put_out'
      collectionDate: string
      services: string[]
    }
  | { kind: 'today'; collectionDate: string; services: string[] }
  | { kind: 'bring_in'; collectionDate: string; services: string[] }

export function reminderForToday(
  events: BinEvent[],
  today: string = todayLondon(),
): BinReminder | null {
  const collectionsByDate = new Map<string, Set<string>>()
  for (const ev of events) {
    const cleaned = friendlyServiceName(ev.summary)
    if (!collectionsByDate.has(ev.date)) collectionsByDate.set(ev.date, new Set())
    collectionsByDate.get(ev.date)!.add(cleaned)
  }

  const yyyymmdd = (d: Date) =>
    d
      .toLocaleDateString('en-GB', {
        timeZone: 'Europe/London',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      .split('/')
      .reverse()
      .join('-')

  const t = new Date(today + 'T12:00:00Z') // anchor at midday, avoids DST edge cases for ±1 day math
  const dPlus1 = new Date(t)
  dPlus1.setUTCDate(dPlus1.getUTCDate() + 1)
  const dMinus1 = new Date(t)
  dMinus1.setUTCDate(dMinus1.getUTCDate() - 1)

  const tomorrow = yyyymmdd(dPlus1)
  const yesterday = yyyymmdd(dMinus1)

  // Priority: today's collection wins, then put-out (eve of), then bring-in (day after).
  if (collectionsByDate.has(today)) {
    return {
      kind: 'today',
      collectionDate: today,
      services: Array.from(collectionsByDate.get(today)!).sort(),
    }
  }
  if (collectionsByDate.has(tomorrow)) {
    return {
      kind: 'put_out',
      collectionDate: tomorrow,
      services: Array.from(collectionsByDate.get(tomorrow)!).sort(),
    }
  }
  if (collectionsByDate.has(yesterday)) {
    return {
      kind: 'bring_in',
      collectionDate: yesterday,
      services: Array.from(collectionsByDate.get(yesterday)!).sort(),
    }
  }
  return null
}

/**
 * "Paper & Cardboard collection" → "Paper & Cardboard"
 * "Mixed Recycling (Cans, Plastics & Glass) collection" → "Mixed Recycling (Cans, Plastics & Glass)"
 */
function friendlyServiceName(s: string): string {
  return s.replace(/\s*collection\s*$/i, '').trim()
}

/** Format a YYYY-MM-DD as "Fri 30 May" using en-GB. */
export function formatBinDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

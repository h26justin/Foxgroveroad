import { describe, expect, it } from 'vitest'
import { nextCollections, parseIcsEvents } from '@/lib/bin-collections'

const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261103',
  'SUMMARY:Paper & Cardboard',
  '  collection', // fold: the first space is dropped on unfolding
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261027',
  'SUMMARY:Food Waste collection',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261020',
  'SUMMARY:Food Waste collection',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

describe('parseIcsEvents', () => {
  it('parses all-day events, unfolds wrapped lines and sorts by date', () => {
    const events = parseIcsEvents(ICS)
    expect(events.map((e) => e.date)).toEqual(['2026-10-20', '2026-10-27', '2026-11-03'])
    expect(events[2].summary).toBe('Paper & Cardboard collection')
  })
})

describe('nextCollections', () => {
  it('drops past dates and groups by day', () => {
    const groups = nextCollections(parseIcsEvents(ICS), 3, '2026-10-24')
    expect(groups.map((g) => g.date)).toEqual(['2026-10-27', '2026-11-03'])
  })
})

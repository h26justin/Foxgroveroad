import { describe, expect, it } from 'vitest'
import { addDaysISO, nightsBetween, todayISO } from '@/lib/dates'

describe('todayISO', () => {
  it('uses the London date, not UTC, just after midnight in summer', () => {
    // 23:30 UTC on 14 June = 00:30 BST on 15 June.
    expect(todayISO(new Date('2026-06-14T23:30:00Z'))).toBe('2026-06-15')
  })

  it('matches UTC in winter (GMT)', () => {
    expect(todayISO(new Date('2026-12-14T23:30:00Z'))).toBe('2026-12-14')
  })

  it('handles the clocks-change nights', () => {
    // 2026-03-29 01:00 UTC clocks go forward; 2026-10-25 01:00 UTC back.
    expect(todayISO(new Date('2026-03-28T23:59:00Z'))).toBe('2026-03-28')
    expect(todayISO(new Date('2026-10-24T23:30:00Z'))).toBe('2026-10-25')
  })
})

describe('addDaysISO', () => {
  it('adds and subtracts across month and year ends', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('is not shifted by the clocks changing', () => {
    expect(addDaysISO('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDaysISO('2026-10-24', 2)).toBe('2026-10-26')
  })
})

describe('nightsBetween', () => {
  it('counts nights', () => {
    expect(nightsBetween('2026-05-01', '2026-05-04')).toBe(3)
  })
})

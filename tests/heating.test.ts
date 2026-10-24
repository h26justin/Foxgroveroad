import { describe, expect, it } from 'vitest'
import {
  coolDownHours,
  dutyCycle,
  equilibrium,
  heatingHoursPerDay,
  isModelUsable,
  parseLiveData,
  warmUpMinutes,
  type HeatingZoneModel,
} from '@/lib/heating'

describe('parseLiveData', () => {
  it('maps thermostat fields and skips devices without a temperature', () => {
    const parsed = parseLiveData({
      HUB_AWAY: false,
      HUB_HOLIDAY: true,
      devices: [
        {
          ZONE_NAME: 'Kitchen',
          ACTUAL_TEMP: '19.46',
          SET_TEMP: '21',
          HEAT_ON: true,
          HOLD_ON: false,
          HOLD_TEMP: 20,
          HOLD_TIME: '0:00',
          STANDBY: false,
          WINDOW_OPEN: false,
          LOW_BATTERY: true,
          OFFLINE: false,
        },
        { ZONE_NAME: 'Repeater 1' },
        { ZONE_NAME: '', ACTUAL_TEMP: '20' },
      ],
    })
    expect(parsed.hubAway).toBe(false)
    expect(parsed.hubHoliday).toBe(true)
    expect(parsed.zones).toHaveLength(1)
    expect(parsed.zones[0]).toMatchObject({
      zone_name: 'Kitchen',
      actual_temp: 19.5,
      set_temp: 21,
      heat_on: true,
      low_battery: true,
      frost_on: false,
    })
  })

  it('tolerates junk input', () => {
    expect(parseLiveData(null).zones).toEqual([])
    expect(parseLiveData({ devices: 'nope' }).zones).toEqual([])
  })
})

// A room that loses 0.15°C/h per °C above outside, heating adds 1.6°C/h,
// background gains 0.1°C/h — the same numbers the SQL fit was checked
// against (db/11_heating.sql §8).
const model = { k: 0.15, h: 1.6, c: 0.1 }

describe('thermal model predictions', () => {
  it('duty cycle balances loss against heating', () => {
    // Loss at 20° vs 5° outside = 0.15 × 15 = 2.25; minus gains 0.1 = 2.15
    // > h, so it can't keep up.
    expect(dutyCycle(model, 20, 5)).toBeCloseTo(2.15 / 1.6, 5)
    expect(heatingHoursPerDay(model, 20, 5)).toBe(24)
    // At 12° outside: (0.15 × 8 - 0.1) / 1.6 = 0.6875 → 16.5 h.
    expect(heatingHoursPerDay(model, 20, 12)).toBeCloseTo(16.5, 5)
    // Warm enough outside that no heating is needed.
    expect(heatingHoursPerDay(model, 20, 25)).toBe(0)
  })

  it('equilibrium temperatures', () => {
    expect(equilibrium(model, 10, true)).toBeCloseTo(10 + 1.7 / 0.15, 5)
    expect(equilibrium(model, 10, false)).toBeCloseTo(10 + 0.1 / 0.15, 5)
  })

  it('warm-up time matches the exponential approach', () => {
    const mins = warmUpMinutes(model, 16, 20, 10)!
    const eq = equilibrium(model, 10, true)
    expect(mins).toBeCloseTo((Math.log((eq - 16) / (eq - 20)) / 0.15) * 60, 5)
    expect(warmUpMinutes(model, 20, 18, 10)).toBe(0)
    // Can't exceed the heated equilibrium.
    expect(warmUpMinutes(model, 16, 30, 10)).toBeNull()
  })

  it('cool-down time with heating off', () => {
    const hours = coolDownHours(model, 20, 17, 5)!
    const eq = equilibrium(model, 5, false)
    expect(hours).toBeCloseTo(Math.log((20 - eq) / (17 - eq)) / 0.15, 5)
    // Never gets colder than the unheated equilibrium.
    expect(coolDownHours(model, 20, 4, 5)).toBeNull()
  })
})

describe('isModelUsable', () => {
  const good: HeatingZoneModel = {
    zone_name: 'Kitchen',
    samples: 4000,
    heating_share: 0.4,
    k: 0.15,
    h: 1.6,
    c: 0.1,
    r2: 0.9,
  }
  it('accepts a well-fitted model', () => {
    expect(isModelUsable(good)).toBe(true)
  })
  it('rejects too little data, nonsense coefficients, or no heating variation', () => {
    expect(isModelUsable(undefined)).toBe(false)
    expect(isModelUsable({ ...good, samples: 100 })).toBe(false)
    expect(isModelUsable({ ...good, k: -0.1 })).toBe(false)
    expect(isModelUsable({ ...good, h: null })).toBe(false)
    expect(isModelUsable({ ...good, heating_share: 1 })).toBe(false)
    expect(isModelUsable({ ...good, r2: 0.05 })).toBe(false)
  })
})

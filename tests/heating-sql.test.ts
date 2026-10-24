import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Runs db/11_heating.sql in an in-memory Postgres and checks the SQL
 * thermal-model fit recovers a simulated room's known coefficients.
 */
const db = new PGlite()

// Simulated room: loses 0.15°C/h per °C above outside, heating adds
// 1.6°C/h, background gains 0.1°C/h. Thermostat 20°C by day, 16°C at
// night, with 0.3°C hysteresis. 14 days of 5-minute readings.
const K = 0.15
const H = 1.6
const C = 0.1

function simulate(): string[] {
  let seed = 42
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  let temp = 18
  let on = false
  const rows: string[] = []
  const start = Date.UTC(2026, 9, 1)
  for (let i = 0; i < 14 * 288; i++) {
    const t = start + i * 300_000
    const hour = (t / 3_600_000) % 24
    const outdoor = 6 + 4 * Math.sin(((hour - 9) / 24) * 2 * Math.PI)
    const target = hour >= 7 && hour < 22 ? 20 : 16
    if (temp < target - 0.3) on = true
    if (temp > target + 0.3) on = false
    rows.push(
      `('Kitchen', to_timestamp(${t / 1000}), ${temp.toFixed(1)}, ${target}, ${on}, ${outdoor.toFixed(1)})`,
    )
    for (let m = 0; m < 5; m++) {
      temp += (-K * (temp - outdoor) + H * (on ? 1 : 0) + C) / 60 + (rand() - 0.5) * 0.01
    }
  }
  return rows
}

beforeAll(async () => {
  // Minimal stand-ins for what the real database already has.
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create table profiles (id uuid primary key, role text);
    create function is_admin() returns boolean language sql as 'select true';
    create table house_settings (key text primary key, value text);
  `)
  const sql = fs.readFileSync('db/11_heating.sql', 'utf8')
  await db.exec(sql)
  await db.exec(sql) // must be safe to re-run
  const rows = simulate()
  for (let i = 0; i < rows.length; i += 500) {
    await db.exec(
      `insert into heating_readings (zone_name, recorded_at, actual_temp, set_temp, heat_on, outdoor_temp)
       values ${rows.slice(i, i + 500).join(',')}`,
    )
  }
}, 30_000)

describe('heating_zone_models', () => {
  it('recovers the simulated room coefficients', async () => {
    // Window is relative to now(), so ask for plenty of days.
    const { rows } = await db.query<{ k: string; h: string; c: string; r2: string }>(
      'select * from heating_zone_models(3650)',
    )
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].k)).toBeCloseTo(K, 2)
    expect(Number(rows[0].h)).toBeGreaterThan(H * 0.9)
    expect(Number(rows[0].h)).toBeLessThan(H * 1.1)
    expect(Number(rows[0].c)).toBeCloseTo(C, 1)
    expect(Number(rows[0].r2)).toBeGreaterThan(0.8)
  })
})

describe('heating_rollup', () => {
  it('writes one row per room per day with heating hours', async () => {
    await db.query(`select heating_rollup('2026-10-02')`)
    const { rows } = await db.query<{ day: Date; heating_hours: string; readings: number }>(
      `select day, heating_hours, readings from heating_daily order by day`,
    )
    expect(rows.length).toBeGreaterThanOrEqual(12)
    for (const r of rows.slice(1, -1)) {
      expect(r.readings).toBe(288)
      expect(Number(r.heating_hours)).toBeGreaterThan(0)
      expect(Number(r.heating_hours)).toBeLessThanOrEqual(24)
    }
  })
})

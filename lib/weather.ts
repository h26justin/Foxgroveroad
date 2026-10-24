import 'server-only'
import type { HeatingForecastDay } from '@/lib/heating'

/**
 * Outdoor temperature for the heating model, from Open-Meteo (free, no
 * API key). Returns null on any failure — callers carry on without it.
 */
export async function fetchOutdoorWeather(
  latitude: number,
  longitude: number,
): Promise<{ current: number; forecast: HeatingForecastDay[] } | null> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${latitude}&longitude=${longitude}` +
    '&current=temperature_2m' +
    '&daily=temperature_2m_max,temperature_2m_min' +
    '&forecast_days=2&timezone=Europe%2FLondon'
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
    if (!res.ok) return null
    const json = (await res.json()) as {
      current?: { temperature_2m?: number }
      daily?: {
        time?: string[]
        temperature_2m_max?: number[]
        temperature_2m_min?: number[]
      }
    }
    const current = json.current?.temperature_2m
    if (typeof current !== 'number') return null
    const days = json.daily?.time ?? []
    const forecast = days.map((date, i) => ({
      date,
      min: json.daily?.temperature_2m_min?.[i] ?? NaN,
      max: json.daily?.temperature_2m_max?.[i] ?? NaN,
    })).filter((d) => Number.isFinite(d.min) && Number.isFinite(d.max))
    return { current, forecast }
  } catch {
    return null
  }
}

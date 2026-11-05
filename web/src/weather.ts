// La Jolla forecast from Open-Meteo (free, no key).
import type { LayerNeed, WeatherBand } from './picker'

const LAT = 32.8328
const LON = -117.2713

export interface Weather {
  date: string
  high: number
  low: number
  morningLow: number
  rain: number
  /** Hour (0–23) the morning marine layer clears; 24 = not before afternoon. */
  marineUntil?: number
  fetchedAt: number
}

export interface WeatherView { band: WeatherBand; layer: LayerNeed; rainy: boolean; marine: boolean; summary: string }

interface OpenMeteo { hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: (number | null)[]; cloud_cover_low: (number | null)[] } }

export const weatherUrl = () =>
  `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
  '&hourly=temperature_2m,precipitation_probability,cloud_cover_low&timezone=America%2FLos_Angeles&forecast_days=2'

export async function fetchWeather(date: string): Promise<Weather> {
  const r = await fetch(weatherUrl())
  if (!r.ok) throw new Error('weather ' + r.status)
  return parseWeather((await r.json()) as OpenMeteo, date)
}

export function parseWeather(j: OpenMeteo, date: string): Weather {
  const h = j.hourly
  const rows = h.time.map((t, i) => ({ hour: Number(t.slice(11, 13)), day: t.slice(0, 10), temp: h.temperature_2m[i], rain: h.precipitation_probability[i] ?? 0, low: h.cloud_cover_low[i] ?? 0 }))
    .filter((r) => r.day === date)
  const day = rows.filter((r) => r.hour >= 7 && r.hour <= 21)
  if (!day.length) throw new Error('no forecast for ' + date)
  const morning = day.filter((r) => r.hour <= 10)
  let marineUntil: number | undefined
  if ((rows.find((r) => r.hour === 7)?.low ?? 0) >= 70) {
    marineUntil = rows.find((r) => r.hour >= 8 && r.hour <= 14 && r.low < 40)?.hour ?? 24
  }
  return {
    date,
    high: Math.max(...day.map((r) => r.temp)),
    low: Math.min(...day.map((r) => r.temp)),
    morningLow: Math.min(...morning.map((r) => r.temp)),
    rain: Math.max(...day.map((r) => r.rain)),
    marineUntil,
    fetchedAt: Date.now(),
  }
}

const hourLabel = (h: number) => (h === 12 ? 'noon' : h < 12 ? `${h} am` : `${h - 12} pm`)

/** Spec table: day high sets top weight, shorts, and layer. */
export function viewWeather(w: Weather): WeatherView {
  const high = Math.round(w.high)
  const band: WeatherBand = high >= 24 ? 'HOT' : high >= 20 ? 'WARM' : high >= 16 ? 'MILD' : 'COOL'
  const layer: LayerNeed = band === 'HOT' ? 'NONE' : band === 'WARM' ? (w.morningLow < 17 ? 'LIGHT' : 'NONE') : band === 'MILD' ? 'LIGHT' : 'WARM'
  const parts = [`${Math.round(w.low)}→${high}°C`, `${Math.round(w.rain)}% rain`]
  if (w.marineUntil !== undefined) parts.push(w.marineUntil >= 24 ? 'Marine layer all morning' : `Marine layer until ${hourLabel(w.marineUntil)}`)
  return { band, layer, rainy: w.rain >= 40, marine: w.marineUntil !== undefined, summary: parts.join(' · ') }
}

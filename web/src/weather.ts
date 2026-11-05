// Forecast from Open-Meteo (free, no key) for the Profile location (default La Jolla).
import type { LayerNeed, WeatherBand } from './picker'


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

export const weatherUrl = (lat: number, lon: number) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  '&hourly=temperature_2m,precipitation_probability,cloud_cover_low&timezone=auto&forecast_days=2'

export async function fetchWeather(date: string, lat: number, lon: number): Promise<Weather> {
  const r = await fetch(weatherUrl(lat, lon))
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

/** Average daily high over the last 30 days, for the twice-yearly season note. */
export async function pastAverageHigh(lat: number, lon: number): Promise<number> {
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max&past_days=30&forecast_days=1&timezone=auto`)
  if (!r.ok) throw new Error('weather ' + r.status)
  const j = (await r.json()) as { daily: { temperature_2m_max: (number | null)[] } }
  const xs = j.daily.temperature_2m_max.slice(0, 30).filter((x): x is number => typeof x === 'number')
  if (!xs.length) throw new Error('no history')
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function seasonNote(avgHigh: number): string {
  const a = Math.round(avgHigh)
  if (avgHigh < 18) return `It's been cool (average high ${a}°C). Bring midweight layers and pants forward.`
  if (avgHigh >= 25) return `It's been hot (average high ${a}°C). Put heavyweight pieces away for now.`
  return `Steady weather (average high ${a}°C). No changes needed.`
}

/** Place name to coordinates (Open-Meteo geocoding). */
export async function geocode(name: string): Promise<{ name: string; lat: number; lon: number } | undefined> {
  const q = name.split(',')[0].trim()
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`)
  if (!r.ok) return undefined
  const j = (await r.json()) as { results?: { name: string; latitude: number; longitude: number; admin1?: string; country_code?: string }[] }
  const hint = name.split(',')[1]?.trim().toLowerCase()
  const hit = j.results?.find((x) => !hint || (x.admin1 ?? '').toLowerCase().startsWith(hint) || (x.country_code ?? '').toLowerCase() === hint || abbr(x.admin1) === hint) ?? j.results?.[0]
  return hit ? { name: [hit.name, hit.admin1].filter(Boolean).join(', '), lat: hit.latitude, lon: hit.longitude } : undefined
}

const STATES: Record<string, string> = { california: 'ca', 'new york': 'ny', texas: 'tx', florida: 'fl', washington: 'wa', oregon: 'or', arizona: 'az', nevada: 'nv', massachusetts: 'ma', illinois: 'il', colorado: 'co', ontario: 'on', 'british columbia': 'bc', quebec: 'qc' }
const abbr = (s?: string) => (s ? STATES[s.toLowerCase()] : undefined)
